import { Request, Response } from "express";
import crypto from "crypto";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { getIO } from "../socket";
import { joinRegularQodSession } from "./qodSession.controller";

import {
  QodAnswer,
  MAX_ANSWERS,
  MAX_PARTICIPANTS,
  MAX_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MIN_SEND_GAP_MS,
  addParticipant,
  createSession,
  findSessionByHost,
  getSession,
  hostRoom,
  hostView,
  removeSession,
  removeAnswer,
  studentRoom,
} from "../socket/liveQod";

function getOwnedSession(pin: string, hostId: string) {
  const session = getSession(pin);
  if (!session) throw new ApiError(404, "This live quiz session has ended");
  if (session.hostId !== hostId) throw new ApiError(403, "You do not have access to this session");
  return session;
}

// ---------- Host (login required) ----------

// Starts an instant live QOD session — or returns the one you already have running.
export const startLiveQod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = findSessionByHost(req.hostId!);
  const session = existing ?? createSession(req.hostId!);
  res.status(existing ? 200 : 201).json({ success: true, data: hostView(session) });
});

export const getActiveLiveQod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = findSessionByHost(req.hostId!);
  res.json({
    success: true,
    data: session
      ? { pin: session.pin, joined: session.participants.size, answerCount: session.answers.length }
      : null,
  });
});

export const getLiveQod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  res.json({ success: true, data: hostView(session) });
});

// Host clicks Continue: the session goes live, students' Submit buttons unlock,
// and the host's answers feed starts showing from here on.
export const continueLiveQod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  session.started = true;
  getIO().to(studentRoom(session.pin)).to(hostRoom(session.pin)).emit("qod:started");
  res.json({ success: true, data: { started: true } });
});

// Host sets or updates the current question. Broadcast to students and the host room.
export const setQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  const text = typeof req.body.question === "string" ? req.body.question.trim() : "";
  if (!text) throw new ApiError(400, "Write a question first");

  session.question = text;
  getIO().to(studentRoom(session.pin)).to(hostRoom(session.pin)).emit("qod:question", { question: text });

  res.json({ success: true, data: { question: text } });
});

// Ends the session: everyone is told, then everything is forgotten.
export const endLiveQod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);

  getIO().to(studentRoom(session.pin)).to(hostRoom(session.pin)).emit("qod:ended");
  removeSession(session.pin);

  res.json({ success: true, message: "Live quiz session ended" });
});

// ---------- Students (public) ----------

// A student enters the PIN and types their own name. The PIN could belong to either
// a Live QOD session (in-memory) or a Regular QOD session (database) — they share one
// PIN space, see section 11 — so Live QOD is checked first, then the DB is the fallback.
export const joinLiveQod = asyncHandler(async (req: Request, res: Response) => {
  const pin = typeof req.body.pin === "string" ? req.body.pin.trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const deviceId = typeof req.body.deviceId === "string" && req.body.deviceId ? req.body.deviceId : undefined;
  if (!name) throw new ApiError(400, "Enter your name");

  const session = pin ? getSession(pin) : undefined;

  if (session) {
    if (session.participants.size >= MAX_PARTICIPANTS) throw new ApiError(400, "This session is full");

    const { name: finalName, token } = addParticipant(session, name, deviceId);
    getIO().to(hostRoom(pin)).emit("qod:stats", { joined: session.participants.size });

    res.status(201).json({
      success: true,
      data: {
        type: "live",
        pin,
        name: finalName,
        token,
        question: session.question,
        started: session.started,
        allowNameEdit: session.settings.allowNameEdit,
      },
    });
    return;
  }

  const regular = pin ? await joinRegularQodSession(pin, name, deviceId) : null;
  if (regular) {
    res.status(201).json({
      success: true,
      data: {
        type: "regular",
        pin,
        sessionId: regular.sessionId,
        name: regular.participant.displayName,
        participantId: regular.participant.id,
        status: regular.status,
        questionId: regular.currentQuestion?.id ?? null,
        question: regular.currentQuestion?.text ?? "",
      },
    });
    return;
  }

  throw new ApiError(404, "No live quiz session found with that PIN");
});

// A student fixes their own name. Gated by the same toggle the implicit
// rejoin-rename in addParticipant follows.
export const renameLiveQodParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { pin, token } = req.params;
  const session = getSession(pin);
  if (!session) throw new ApiError(404, "This live quiz session has ended");

  const participant = session.participants.get(token);
  if (!participant) throw new ApiError(400, "Please rejoin the session with the QOD PIN");

  if (!session.settings.allowNameEdit) {
    throw new ApiError(403, "The host has disabled name editing right now");
  }

  const displayName = typeof req.body.displayName === "string" ? req.body.displayName.trim() : "";
  if (displayName.length < 2) throw new ApiError(400, "Display name must be at least 2 characters");

  const used = new Set(
    Array.from(session.participants.entries())
      .filter(([t]) => t !== token)
      .map(([, p]) => p.name.toLowerCase())
  );
  const base = displayName.slice(0, MAX_NAME_LENGTH);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}`;
    n++;
  }

  participant.name = candidate;

  getIO().to(hostRoom(session.pin)).emit("qod:participant-renamed", { token, name: candidate });

  res.json({ success: true, data: { name: candidate } });
});

// A student submits one answer. They can submit repeatedly until the host ends the session.
export const submitLiveQodAnswer = asyncHandler(async (req: Request, res: Response) => {
  const session = getSession(req.params.pin);
  if (!session) throw new ApiError(404, "This live quiz session has ended");

  const { token, text } = req.body;
  const participant = typeof token === "string" ? session.participants.get(token) : undefined;
  if (!participant) throw new ApiError(400, "Please rejoin the session with the QOD PIN");

  const answerText = typeof text === "string" ? text.trim() : "";
  if (!answerText) throw new ApiError(400, "Write an answer first");
  if (answerText.length > MAX_TEXT_LENGTH) {
    throw new ApiError(400, `Your answer can be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (session.answers.length >= MAX_ANSWERS) {
    throw new ApiError(400, "This session has reached its answer limit");
  }

  const now = Date.now();
  if (now - participant.lastSentAt < MIN_SEND_GAP_MS) {
    throw new ApiError(429, "Please wait a moment before sending again");
  }
  participant.lastSentAt = now;

  const entry: QodAnswer = {
    id: crypto.randomBytes(8).toString("hex"),
    name: participant.name,
    text: answerText,
    at: now,
  };
  session.answers.push(entry);

  // Only the host's screen receives it.
  getIO().to(hostRoom(session.pin)).emit("qod:new-answer", entry);

  res.status(201).json({ success: true });
});


// Host removes one answer — inappropriate or sent by accident. Not a database
// delete; these answers were never saved there, so this just drops it from the
// live feed everyone currently sees.
export const deleteLiveQodAnswer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  const removed = removeAnswer(session, req.params.answerId);
  if (!removed) throw new ApiError(404, "Answer not found");

  getIO().to(hostRoom(session.pin)).emit("qod:answer-deleted", { answerId: req.params.answerId });

  res.json({ success: true, message: "Answer deleted" });
});