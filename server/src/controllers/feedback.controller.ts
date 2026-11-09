import { Request, Response } from "express";
import crypto from "crypto";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { getIO } from "../socket";
import prisma from "../config/prisma";

import {
  FeedbackMessage,
  MAX_MESSAGES,
  MAX_PARTICIPANTS,
  MAX_TEXT_LENGTH,
  MIN_SEND_GAP_MS,
  addParticipant,
  createSession,
  findSessionByHost,
  getSession,
  hostRoom,
  hostView,
  removeSession,
  removeMessage,
  renameParticipant,
  studentRoom,
} from "../socket/liveFeedback";

function getOwnedSession(pin: string, hostId: string) {
  const session = getSession(pin);
  if (!session) throw new ApiError(404, "This feedback session has ended");
  if (session.hostId !== hostId) throw new ApiError(403, "You do not have access to this session");
  return session;
}

// ---------- Host (login required) ----------

// Starts a live feedback session — or returns the one you already have running.
export const startLiveFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = findSessionByHost(req.hostId!);
  const session = existing ?? createSession(req.hostId!);
  res.status(existing ? 200 : 201).json({ success: true, data: hostView(session) });
});

// Your running session, if any (so the page can offer "Resume").
export const getActiveLiveFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = findSessionByHost(req.hostId!);
  res.json({
    success: true,
    data: session
      ? { pin: session.pin, joined: session.participants.size, messageCount: session.messages.length }
      : null,
  });
});

export const getLiveFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  res.json({ success: true, data: hostView(session) });
});

// Ends the session: everyone is told, then everything is forgotten.
export const endLiveFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);

  getIO().to(studentRoom(session.pin)).to(hostRoom(session.pin)).emit("feedback:ended");
  removeSession(session.pin);

  res.json({ success: true, message: "Live feedback session ended" });
});

// ---------- Students (public) ----------

// A student enters the PIN and gets an anonymous name.
export const joinLiveFeedback = asyncHandler(async (req: Request, res: Response) => {
  const pin = typeof req.body.pin === "string" ? req.body.pin.trim() : "";
  const session = pin ? getSession(pin) : undefined;

  if (!session) throw new ApiError(404, "No live feedback session found with that PIN");
  if (session.participants.size >= MAX_PARTICIPANTS) throw new ApiError(400, "This session is full");

  const { name, token } = addParticipant(session);
  getIO().to(hostRoom(pin)).emit("feedback:stats", { joined: session.participants.size });

  res.status(201).json({ success: true, data: { pin, name, token, allowNameEdit: session.settings.allowNameEdit } });
});

// A student overrides their anonymous name — only works while the host's
// allowNameEdit toggle is on. Scoped by token (feedback has no participant id
// the student ever sees, unlike Quiz Session/Regular QOD).
export const renameLiveFeedbackParticipant = asyncHandler(async (req: Request, res: Response) => {
  const session = getSession(req.params.pin);
  if (!session) throw new ApiError(404, "This feedback session has ended");
  if (!session.settings.allowNameEdit) {
    throw new ApiError(403, "The host has disabled name editing right now");
  }

  const { token } = req.params;
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2) {
    throw new ApiError(400, "Name must be at least 2 characters");
  }

  const finalName = renameParticipant(session, token, displayName);
  if (!finalName) throw new ApiError(400, "Please rejoin the session with the Feedback PIN");

  res.json({ success: true, data: { name: finalName } });
});

// A student sends one piece of feedback.
export const sendLiveFeedback = asyncHandler(async (req: Request, res: Response) => {
  const session = getSession(req.params.pin);
  if (!session) throw new ApiError(404, "This feedback session has ended");

  const { token, text } = req.body;
  const participant = typeof token === "string" ? session.participants.get(token) : undefined;
  if (!participant) throw new ApiError(400, "Please rejoin the session with the Feedback PIN");

  const message = typeof text === "string" ? text.trim() : "";
  if (!message) throw new ApiError(400, "Write some feedback first");
  if (message.length > MAX_TEXT_LENGTH) {
    throw new ApiError(400, `Feedback can be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (session.messages.length >= MAX_MESSAGES) {
    throw new ApiError(400, "This session has reached its feedback limit");
  }

  const now = Date.now();
  if (now - participant.lastSentAt < MIN_SEND_GAP_MS) {
    throw new ApiError(429, "Please wait a moment before sending again");
  }
  participant.lastSentAt = now;

  const entry: FeedbackMessage = {
    id: crypto.randomBytes(8).toString("hex"),
    name: participant.name,
    text: message,
    at: now,
  };
  session.messages.push(entry);

  // Only the host's screen receives it.
  getIO().to(hostRoom(session.pin)).emit("feedback:new", entry);

  res.status(201).json({ success: true });
});

// Starts live feedback for a finished game, using the game's own PIN.
export const startGameFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const game = await prisma.quizSession.findUnique({
    where: { id: req.params.sessionId },
    include: { quiz: { select: { hostId: true } } },
  });

  if (!game || game.deletedAt) throw new ApiError(404, "Game not found");
  if (!game.quiz || game.quiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this game");

  const existing = getSession(game.gamePin);
  if (existing && existing.hostId !== req.hostId) {
    throw new ApiError(400, "That PIN is already being used for feedback. Please try again.");
  }
  const feedback = existing ?? createSession(req.hostId!, game.gamePin);

  // Tell the players still connected to the game that feedback is open.
  getIO().to(game.gamePin).emit("feedback:open", { pin: feedback.pin });

  res.status(existing ? 200 : 201).json({ success: true, data: { pin: feedback.pin } });
});

// Host removes one piece of feedback — inappropriate or sent by accident. Not a
// database delete; nothing here was ever saved there, so this just drops it from
// the live feed everyone currently sees.
export const deleteLiveFeedbackMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = getOwnedSession(req.params.pin, req.hostId!);
  const removed = removeMessage(session, req.params.messageId);
  if (!removed) throw new ApiError(404, "Message not found");

  getIO().to(hostRoom(session.pin)).emit("feedback:message-deleted", { messageId: req.params.messageId });

  res.json({ success: true, message: "Feedback deleted" });
});