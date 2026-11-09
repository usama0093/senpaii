import { Request, Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { getIO } from "../socket";
import { generateUniqueQodPin } from "../utils/generatePin";
import { studentRoom, hostRoom, participantRoom } from "../socket/qodSession";
import { MAX_TEXT_LENGTH, MAX_NAME_LENGTH } from "../socket/liveQod";
import { getQodSessionSettings, clearQodSessionSettings } from "../socket/qodGameState";

// ---------- shared helpers ----------

async function getOwnedQodSession(sessionId: string, hostId: string) {
  const session = await prisma.qodSession.findUnique({
    where: { id: sessionId },
    include: {
      qodQuiz: {
        include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
      },
    },
  });

  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.qodQuiz?.hostId ?? session.hostId;
  if (ownerId !== hostId) throw new ApiError(403, "You do not have access to this session");
  // getOwnedQodSession is only ever used for a LIVE session (next-question, end,
  // remove-participant, delete-response) — an already-detached (quiz permanently
  // deleted) session has nothing live left to do.
  if (!session.qodQuiz) throw new ApiError(400, "This QOD quiz has been deleted");
  // A type assertion here (rather than spreading into a new object) keeps the
  // exact same Prisma result object and reference — only its TYPE is narrowed,
  // telling every caller "qodQuiz is proven non-null from here on" without
  // reconstructing the object's shape, which would otherwise cause cascading
  // errors on unrelated fields (gamePin, startedAt, etc.) at every call site.
  return session as typeof session & { qodQuiz: NonNullable<typeof session.qodQuiz> };
}

function currentQuestionOf(session: {
  status: string;
  currentQuestionIndex: number;
  qodQuiz: { questions: { id: string; text: string }[] } | null;
}) {
  // This is the actual root cause of several downstream bugs: without the status
  // check, a session still in WAITING would report its first question as "current"
  // just because currentQuestionIndex defaults to 0 — even though nothing has
  // started yet. Everything that calls this (joining, the host's own view, submit
  // validation) now correctly sees "no active question" before Start.
  if (session.status !== "ACTIVE") return null;
  // A null qodQuiz means the quiz has since been permanently deleted — only
  // possible for an already-ENDED session, which the check above already
  // excludes, but TypeScript still needs this to narrow the type.
  if (!session.qodQuiz) return null;
  return session.qodQuiz.questions[session.currentQuestionIndex] ?? null;
}

// A student types their own name (not anonymous). Duplicates get a number appended,
// same rule as Live QOD — scoped to this one session's participants.
function dedupeName(existingNames: string[], requestedName: string): string {
  const used = new Set(existingNames.map((n) => n.toLowerCase()));
  const base = requestedName.slice(0, MAX_NAME_LENGTH);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}`;
    n++;
  }
  return candidate;
}

// ---------- Host (login required) ----------

// Starts a Regular QOD session for this quiz, or resumes the one already running.
export const startQodSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId } = req.body;
  if (!qodQuizId) throw new ApiError(400, "qodQuizId is required");

  const quiz = await prisma.qodQuiz.findUnique({ where: { id: qodQuizId } });
  if (!quiz || quiz.deletedAt) throw new ApiError(404, "Quiz not found");
  if (quiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this quiz");

  const existing = await prisma.qodSession.findFirst({
    where: { qodQuizId, deletedAt: null, status: { in: ["WAITING", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    res.json({ success: true, data: existing });
    return;
  }

  const gamePin = await generateUniqueQodPin();
  const session = await prisma.qodSession.create({
    data: { qodQuizId, hostId: quiz.hostId, gamePin, status: "WAITING" },
  });

  res.status(201).json({ success: true, data: session });
});

// Full state for the host running screen.
export const getQodSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getOwnedQodSession(req.params.sessionId, req.hostId!);
  const participants = await prisma.qodParticipant.findMany({
    where: { sessionId: session.id },
    orderBy: { joinedAt: "asc" },
    select: { id: true, displayName: true },
  });

  const currentQuestion = currentQuestionOf(session);
  const totalQuestions = session.qodQuiz.questions.length;

  // Every response to the current question, newest first — a resubmitted answer
  // is a new row, so it naturally lands on top without any extra logic.
  const responses = currentQuestion
    ? (
        await prisma.qodResponse.findMany({
          where: { questionId: currentQuestion.id, participant: { sessionId: session.id } },
          orderBy: { answeredAt: "desc" },
          include: { participant: { select: { displayName: true } } },
        })
      ).map((r) => ({
        id: r.id,
        participantId: r.participantId,
        displayName: r.participant.displayName,
        text: r.text,
        at: r.answeredAt,
      }))
    : [];

  res.json({
    success: true,
    data: {
      id: session.id,
      gamePin: session.gamePin,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions,
      currentQuestion: currentQuestion ? { id: currentQuestion.id, text: currentQuestion.text } : null,
      participantCount: participants.length,
      // Shown on the waiting screen before the session starts, same as Quiz Session's lobby.
      participants: participants.map((p) => ({ participantId: p.id, displayName: p.displayName })),
      responses,
      settings: getQodSessionSettings(session.id),
    },
  });
});

// Host clicks Next: moves to the next question. Manual pacing — no timer, ever.
export const nextQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getOwnedQodSession(req.params.sessionId, req.hostId!);
  if (session.status === "ENDED") throw new ApiError(400, "This session has already ended");

  const totalQuestions = session.qodQuiz.questions.length;
  if (totalQuestions === 0) throw new ApiError(400, "Add at least one question before starting");

  // Don't let the host start with an empty room — that only produces a blank report.
  if (session.status === "WAITING") {
    const participantCount = await prisma.qodParticipant.count({ where: { sessionId: session.id } });
    if (participantCount === 0) {
      throw new ApiError(400, "At least one student must join before starting");
    }
  }

  const nextIndex = session.status === "WAITING" ? 0 : session.currentQuestionIndex + 1;
  if (nextIndex >= totalQuestions) throw new ApiError(400, "No more questions — end the session instead");

  const question = session.qodQuiz.questions[nextIndex];

  const updated = await prisma.qodSession.update({
    where: { id: session.id },
    data: {
      status: "ACTIVE",
      currentQuestionIndex: nextIndex,
      startedAt: session.startedAt ?? new Date(),
    },
  });

  await prisma.qodSessionQuestion.upsert({
    where: { sessionId_questionId: { sessionId: session.id, questionId: question.id } },
    create: { sessionId: session.id, questionId: question.id, order: nextIndex + 1, questionTextSnapshot: question.text },
    update: {},
  });

  getIO()
    .to(studentRoom(updated.gamePin))
    .to(hostRoom(updated.gamePin))
    .emit("qod-session:question", { questionId: question.id, text: question.text, index: nextIndex, totalQuestions });

  res.json({ success: true, data: { currentQuestionIndex: nextIndex, question: { id: question.id, text: question.text } } });
});

// Ends the session for good — it can no longer be resumed or joined.
export const endQodSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getOwnedQodSession(req.params.sessionId, req.hostId!);
  if (session.status === "ENDED") {
    res.json({ success: true, message: "Session already ended" });
    return;
  }

  // A session still WAITING has never had a question shown — no gameplay, nothing
  // worth a report. Delete it outright (cascades any participants who joined but
  // never played) instead of leaving an empty "finished" row behind.
  if (session.status === "WAITING") {
    await prisma.qodSession.delete({ where: { id: session.id } });
    clearQodSessionSettings(session.id);
    getIO().to(studentRoom(session.gamePin)).to(hostRoom(session.gamePin)).emit("qod-session:ended");
    res.json({ success: true, message: "Session ended" });
    return;
  }

  await prisma.qodSession.update({
    where: { id: session.id },
    data: {
      status: "ENDED",
      endedAt: new Date(),
      hostId: session.qodQuiz.hostId,
      quizTitleSnapshot: session.qodQuiz.title,
      quizTopicSnapshot: session.qodQuiz.topic,
    },
  });
  clearQodSessionSettings(session.id);

  getIO().to(studentRoom(session.gamePin)).to(hostRoom(session.gamePin)).emit("qod-session:ended");

  res.json({ success: true, message: "Session ended" });
});

// ---------- Students (public) ----------

// Called ONLY from liveQod.controller.ts's joinLiveQod, as the fallback when no
// in-memory Live QOD session matches the PIN (see section 11 — one shared PIN space).
// Returns null if no Regular QOD session has that PIN either.
export async function joinRegularQodSession(pin: string, name: string, deviceId?: string) {
  const session = await prisma.qodSession.findFirst({
    where: { gamePin: pin },
    include: {
      qodQuiz: { include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } } },
      participants: true,
    },
  });
  if (!session || session.deletedAt || session.status === "ENDED") return null;

  // A returning student on this device resumes their existing row (same id, same
  // responses so far) instead of getting a duplicate. If they typed a DIFFERENT
  // name this time, that's treated as an implicit rename — but only when the
  // host's name-edit toggle currently allows it; otherwise the old name sticks,
  // same as before. Once removed by the host, their old row (and deviceId) is
  // gone, so this lookup simply finds nothing on their next join and falls
  // through to create a fresh one.
  if (deviceId) {
    const existing = session.participants.find((p) => p.deviceId === deviceId);
    if (existing) {
      const currentQuestion = currentQuestionOf(session);
      const requestedName = typeof name === "string" ? name.trim() : "";
      const { allowNameEdit } = getQodSessionSettings(session.id);

      if (allowNameEdit && requestedName.length >= 2 && requestedName !== existing.displayName) {
        const others = session.participants.filter((p) => p.id !== existing.id).map((p) => p.displayName);
        const finalName = dedupeName(others, requestedName);
        const renamed = await prisma.qodParticipant.update({
          where: { id: existing.id },
          data: { displayName: finalName },
        });
        getIO().to(hostRoom(session.gamePin)).emit("qod-session:participant-renamed", {
          participantId: renamed.id,
          displayName: renamed.displayName,
        });
        return { participant: renamed, sessionId: session.id, status: session.status, currentQuestion };
      }

      return { participant: existing, sessionId: session.id, status: session.status, currentQuestion };
    }
  }

  const finalName = dedupeName(session.participants.map((p) => p.displayName), name);
  const participant = await prisma.qodParticipant.create({
    data: { sessionId: session.id, displayName: finalName, deviceId: deviceId || null },
  });

  const currentQuestion = currentQuestionOf(session);

  getIO().to(hostRoom(session.gamePin)).emit("qod-session:stats", { joined: session.participants.length + 1 });

  return { participant, sessionId: session.id, status: session.status, currentQuestion };
}

// Every QOD session this host has run (or is about to run), newest first.
// Reports.tsx filters this down to ENDED ones client-side, same as Quiz Session's /sessions.
// The OR covers a report whose QOD quiz has since been permanently deleted
// (qodQuiz is null, so the relation filter alone would silently exclude it) —
// same fix Quiz Session's getAllSessions already has.
export const getAllQodSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.qodSession.findMany({
    where: { deletedAt: null, OR: [{ qodQuiz: { hostId: req.hostId! } }, { hostId: req.hostId! }] },
    orderBy: { createdAt: "desc" },
    include: {
      qodQuiz: { select: { id: true, title: true, topic: true } },
      _count: { select: { participants: true } },
    },
  });

  res.json({ success: true, data: sessions });
});

// Public, read-only snapshot of a session's current status and question — used by the
// student page to resync itself after a refresh, since the original join response is
// only a snapshot from that moment and goes stale if the host has moved on since.
export const getQodSessionPublicStatus = asyncHandler(async (req: Request, res: Response) => {
  const session = await prisma.qodSession.findUnique({
    where: { id: req.params.sessionId },
    include: { qodQuiz: { include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } } } },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");

  const currentQuestion = currentQuestionOf(session);

  res.json({
    success: true,
    data: {
      status: session.status,
      questionId: currentQuestion?.id ?? null,
      question: currentQuestion?.text ?? "",
      settings: getQodSessionSettings(session.id),
    },
  });
});

// Public: a student's own previously-submitted responses to one question — used to
// rebuild their response list after a refresh. Scoped strictly to their own
// participantId, never anyone else's.
export const getMyQodResponses = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { participantId, questionId } = req.query;

  if (typeof participantId !== "string" || typeof questionId !== "string") {
    throw new ApiError(400, "participantId and questionId are required");
  }

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  const responses = await prisma.qodResponse.findMany({
    where: { participantId, questionId },
    orderBy: { answeredAt: "desc" },
    select: { id: true, text: true, answeredAt: true },
  });

  res.json({ success: true, data: responses.map((r) => ({ id: r.id, text: r.text, at: r.answeredAt })) });
});

// A student fixes their own name. Unlike Quiz Session's rename (WAITING-only), this
// works any time up to ENDED, since joining itself is allowed at any point too.
export const renameQodParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, participantId } = req.params;
  const { displayName } = req.body;

  if (!displayName || displayName.trim().length < 2) {
    throw new ApiError(400, "Display name must be at least 2 characters");
  }

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  const session = await prisma.qodSession.findUnique({ where: { id: sessionId } });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  if (session.status === "ENDED") throw new ApiError(400, "This session has ended");
  if (!getQodSessionSettings(sessionId).allowNameEdit) {
    throw new ApiError(403, "The host has disabled name editing right now");
  }

  // Dedupe against the others in this session, same rule as joining.
  const others = await prisma.qodParticipant.findMany({
    where: { sessionId, id: { not: participantId } },
    select: { displayName: true },
  });
  const used = new Set(others.map((p) => p.displayName.toLowerCase()));
  const base = displayName.trim().slice(0, MAX_NAME_LENGTH);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}`;
    n++;
  }

  const updated = await prisma.qodParticipant.update({
    where: { id: participantId },
    data: { displayName: candidate },
  });

  getIO().to(hostRoom(session.gamePin)).emit("qod-session:participant-renamed", {
    participantId: updated.id,
    displayName: updated.displayName,
  });

  res.json({ success: true, data: { participantId: updated.id, displayName: updated.displayName } });
});


// Host corrects a participant's name directly on a finished report — a one-off data
// fix, unrelated to the live renameQodParticipant flow (its Allow-name-editing toggle
// is cleared on endQodSession anyway). Only works once the session has ENDED.
export const renameQodReportParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, participantId } = req.params;
  const { displayName } = req.body;

  if (!displayName || displayName.trim().length < 2) {
    throw new ApiError(400, "Display name must be at least 2 characters");
  }

  const session = await prisma.qodSession.findUnique({
    where: { id: sessionId },
    include: { qodQuiz: { select: { hostId: true } } },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.qodQuiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");
  if (session.status !== "ENDED") throw new ApiError(400, "This report is not available yet");

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  const updated = await prisma.qodParticipant.update({
    where: { id: participantId },
    data: { displayName: displayName.trim() },
  });

  res.json({ success: true, data: { participantId: updated.id, displayName: updated.displayName } });
});

// Host removes one student — e.g. an inappropriate name. A hard delete, not Trash:
// their responses go with them (cascade), and removing them does NOT block them
// from joining again — a fresh join just creates a brand-new row, same as any new
// student (their old deviceId link is gone along with the deleted row).
export const removeQodParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, participantId } = req.params;
  const session = await getOwnedQodSession(sessionId, req.hostId!);

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  await prisma.qodParticipant.delete({ where: { id: participantId } }); // cascades their responses

  // Same reasoning as Quiz Session's removeParticipant — an ENDED session's PIN
  // may now belong to a different live session (PIN reuse), so only broadcast
  // while this one is actually live.
  if (session.status !== "ENDED") {
    getIO()
      .to(hostRoom(session.gamePin))
      .to(studentRoom(session.gamePin))
      .to(participantRoom(participantId))
      .emit("qod-session:participant-removed", { participantId });
  }

  res.json({ success: true, message: "Participant removed" });
});

// A student submits (or resubmits) their answer to the currently active question.
export const submitQodResponse = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { participantId, questionId, text } = req.body;

  if (!participantId || !questionId) throw new ApiError(400, "Missing participant or question");
  const answerText = typeof text === "string" ? text.trim() : "";
  if (!answerText) throw new ApiError(400, "Write an answer first");
  if (answerText.length > MAX_TEXT_LENGTH) {
    throw new ApiError(400, `Your answer can be at most ${MAX_TEXT_LENGTH} characters`);
  }

  const session = await prisma.qodSession.findUnique({
    where: { id: sessionId },
    include: { qodQuiz: { include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } } } },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  if (session.status !== "ACTIVE") throw new ApiError(400, "There is no active question right now");

  const currentQuestion = currentQuestionOf(session);
  if (!currentQuestion || currentQuestion.id !== questionId) {
    throw new ApiError(400, "This question is no longer active");
  }

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) {
    throw new ApiError(400, "Please rejoin the session with the QOD PIN");
  }

  // Each submission is its own row now — students can send as many as they want
  // per question, and the newest one is what shows on top of the host's feed.
  const response = await prisma.qodResponse.create({
    data: { participantId, questionId, text: answerText, questionTextSnapshot: currentQuestion.text },
  });

  // Only the host's screen sees live responses, same as Live QOD.
  getIO().to(hostRoom(session.gamePin)).emit("qod-session:new-response", {
    id: response.id,
    participantId,
    displayName: participant.displayName,
    questionId,
    text: response.text,
    at: response.answeredAt,
  });

  // The client needs this real id back so that editing this exact response later
  // (not a locally-guessed id) targets the right row.
  res.status(201).json({ success: true, data: { id: response.id, text: response.text, at: response.answeredAt } });
});

// A student edits one of their own responses to the current question. This REPLACES
// that row (and bumps its timestamp) instead of creating a new one — unlike a plain
// resubmit, which is a separate answer. Public, not host-only.
export const updateQodResponse = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, responseId } = req.params;
  const { participantId, text } = req.body;

  if (!participantId) throw new ApiError(400, "Missing participant");
  const answerText = typeof text === "string" ? text.trim() : "";
  if (!answerText) throw new ApiError(400, "Write an answer first");
  if (answerText.length > MAX_TEXT_LENGTH) {
    throw new ApiError(400, `Your answer can be at most ${MAX_TEXT_LENGTH} characters`);
  }

  const session = await prisma.qodSession.findUnique({
    where: { id: sessionId },
    include: { qodQuiz: { include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } } } },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  if (session.status !== "ACTIVE") throw new ApiError(400, "There is no active question right now");

  const currentQuestion = currentQuestionOf(session);
  if (!currentQuestion) throw new ApiError(400, "This question is no longer active");

  const existing = await prisma.qodResponse.findUnique({ where: { id: responseId } });
  if (!existing || existing.participantId !== participantId || existing.questionId !== currentQuestion.id) {
    throw new ApiError(400, "This response can no longer be edited");
  }

  const updated = await prisma.qodResponse.update({
    where: { id: responseId },
    data: { text: answerText, answeredAt: new Date() },
  });

  const participant = await prisma.qodParticipant.findUnique({ where: { id: participantId } });

  // Reuses the event the host already listens for — merging by id in place (and
  // re-sorting by timestamp) is what moves the edited response to the top, with
  // no duplicate row.
  getIO().to(hostRoom(session.gamePin)).emit("qod-session:new-response", {
    id: updated.id,
    participantId,
    displayName: participant?.displayName ?? "",
    questionId: currentQuestion.id,
    text: updated.text,
    at: updated.answeredAt,
  });

  res.json({ success: true, data: { id: updated.id, text: updated.text, at: updated.answeredAt } });
});

// Host removes one response — e.g. inappropriate or sent by accident. Gone for good,
// not moved to Trash: a single raw-text answer has no report value on its own.
export const deleteQodResponse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, responseId } = req.params;
  const session = await getOwnedQodSession(sessionId, req.hostId!);

  const response = await prisma.qodResponse.findUnique({ where: { id: responseId } });
  if (!response) throw new ApiError(404, "Response not found");

  const participant = await prisma.qodParticipant.findUnique({ where: { id: response.participantId } });
  if (!participant || participant.sessionId !== session.id) {
    throw new ApiError(403, "You do not have access to this response");
  }

  await prisma.qodResponse.delete({ where: { id: responseId } });

  // Both sides need to hear this: the host's feed drops the row, and if the
  // response belonged to a connected student, it disappears from their own list too.
  getIO()
    .to(hostRoom(session.gamePin))
    .to(studentRoom(session.gamePin))
    .emit("qod-session:response-deleted", { responseId });

  res.json({ success: true, message: "Response deleted" });
});


// Full results of a finished session: Name + response count per player, and every
// response they sent, grouped by question, in order. No scores or ranks — Regular
// QOD is reviewed manually, there's nothing auto-graded to rank by.
export const getQodSessionReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  const session = await prisma.qodSession.findUnique({
    where: { id: sessionId },
    include: { qodQuiz: { select: { id: true, title: true, topic: true, hostId: true } } },
  });

  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");

  const ownerId = session.qodQuiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");
  if (session.status !== "ENDED") throw new ApiError(400, "The report is available once the session has ended");

  const participants = await prisma.qodParticipant.findMany({
    where: { sessionId: session.id },
    orderBy: { displayName: "asc" },
  });

  const [responses, sessionQuestions] = await Promise.all([
    prisma.qodResponse.findMany({
      where: { participant: { sessionId: session.id } },
      orderBy: { answeredAt: "asc" },
      select: { id: true, participantId: true, questionId: true, text: true, answeredAt: true },
    }),
    prisma.qodSessionQuestion.findMany({ where: { sessionId: session.id }, orderBy: { order: "asc" } }),
  ]);

  // Every question actually shown in this session, independent of whether it ever
  // got a response — same principle Quiz Session already uses, now self-contained
  // via its own snapshot instead of a live QodQuestion join.
  const questions = sessionQuestions.map((sq, index) => ({
    id: sq.questionId,
    number: index + 1,
    text: sq.questionTextSnapshot,
  }));

  const responsesByParticipant = new Map<string, typeof responses>();
  for (const r of responses) {
    const list = responsesByParticipant.get(r.participantId);
    if (list) list.push(r);
    else responsesByParticipant.set(r.participantId, [r]);
  }

  const players = participants.map((p) => {
    const mine = responsesByParticipant.get(p.id) ?? [];
    return {
      participantId: p.id,
      displayName: p.displayName,
      responseCount: mine.length,
      responses: mine.map((r) => ({ id: r.id, questionId: r.questionId, text: r.text, answeredAt: r.answeredAt })),
    };
  });

  res.json({
    success: true,
    data: {
      session: {
        id: session.id,
        gamePin: session.gamePin,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        qodQuizId: session.qodQuiz?.id ?? null,
        quizTitle: session.qodQuiz?.title ?? session.quizTitleSnapshot ?? "Deleted QOD quiz",
        topic: session.qodQuiz?.topic ?? session.quizTopicSnapshot ?? null,
      },
      summary: {
        playerCount: players.length,
        questionCount: questions.length,
        totalResponses: responses.length,
      },
      players,
      questions,
    },
  });
});


// Moves a finished session's REPORT to Trash. Not the same as ending a live session
// (DELETE /:sessionId, which just sets status to ENDED) — this is the Trash action,
// only valid once a session already has a report worth keeping.
export const trashQodSessionReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await prisma.qodSession.findUnique({
    where: { id: req.params.sessionId },
    include: { qodQuiz: { select: { hostId: true } } },
  });
  if (!session) throw new ApiError(404, "Session not found");
  const ownerId = session.qodQuiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");
  if (session.status !== "ENDED") throw new ApiError(400, "Only a finished session's report can be moved to Trash");
  if (session.deletedAt) throw new ApiError(400, "This report is already in Trash");

  await prisma.qodSession.update({ where: { id: session.id }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Moved to Trash" });
});