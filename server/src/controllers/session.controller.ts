import { Request, Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { generateUniquePin } from "../utils/generatePin";
import { getRankedParticipants } from "../utils/ranking";
import { cleanupQuizLeftovers } from "../utils/cleanup";
import { getIO } from "../socket";
import { clearActiveQuestion, getSessionSettings, clearSessionSettings, clearRevealed } from "../socket/gameState";
import { deleteSessionsForever } from "../utils/trash";

export const startSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId } = req.params;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { where: { deletedAt: null } } },
  });

  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (quiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this quiz");
  if (quiz.deletedAt) throw new ApiError(400, "This quiz was deleted, so it can't be played again");
  if (quiz.questions.length === 0) {
    throw new ApiError(400, "Add at least one question before starting a session");
  }

  const gamePin = await generateUniquePin();

  const session = await prisma.quizSession.create({
    data: { quizId, hostId: quiz.hostId, gamePin, status: "WAITING" },
  });

  res.status(201).json({ success: true, data: session });
});

// Lists a quiz's sessions (newest first) for the host
export const getQuizSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId } = req.params;

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz || quiz.deletedAt) throw new ApiError(404, "Quiz not found");
  if (quiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this quiz");

  const sessions = await prisma.quizSession.findMany({
    where: { quizId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });

  res.json({ success: true, data: sessions });
});

// Every game this host has run (or is about to run), newest first
export const getAllSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.quizSession.findMany({
    // OR covers a report whose quiz has since been permanently deleted (quiz is
    // null, so the relation filter alone would silently exclude it).
    where: { deletedAt: null, OR: [{ quiz: { hostId: req.hostId! } }, { hostId: req.hostId! }] },
    orderBy: { createdAt: "desc" },
    include: {
      quiz: { select: { id: true, title: true, topic: true } },
      _count: { select: { participants: true } },
    },
  });

  res.json({ success: true, data: sessions });
});

// // Permanent delete: removes the game (its report), its players and all their answers
// // from the database. Leftovers that only this game kept alive are removed too.
// export const deleteSession = asyncHandler(async (req: AuthRequest, res: Response) => {
//   const { sessionId } = req.params;

//   const session = await prisma.quizSession.findUnique({
//     where: { id: sessionId },
//     include: { quiz: true },
//   });

//   if (!session) throw new ApiError(404, "Session not found");
//   if (session.quiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this session");

//   // If a game was running, stop its timer and tell everyone in the room it's over.
//   clearActiveQuestion(sessionId);
//   getIO().to(session.gamePin).emit("game:ended");

//   // Real delete, in one transaction: answers first, then players, then the game itself.
//   const [answers, players] = await prisma.$transaction([
//     prisma.answer.deleteMany({ where: { participant: { sessionId } } }),
//     prisma.participant.deleteMany({ where: { sessionId } }),
//     prisma.quizSession.delete({ where: { id: sessionId } }),
//   ]);

//   await cleanupQuizLeftovers(session.quizId);

//   res.json({
//     success: true,
//     message: "Session deleted permanently",
//     data: { deletedAnswers: answers.count, deletedPlayers: players.count },
//   });
// });

// A finished game (a report) moves to Trash, so it can be restored.
// A game that never finished (an opened lobby, or one left mid-game) has no report
// worth keeping, so it is deleted completely.
export const deleteSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: { quiz: true },
  });

  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.quiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");

  if (session.status === "ENDED") {
    await prisma.quizSession.update({ where: { id: sessionId }, data: { deletedAt: new Date() } });
    res.json({ success: true, message: "Moved to Trash" });
    return;
  }

  // Stop a running game and tell everyone in the room it's over.
  clearActiveQuestion(sessionId);
  clearSessionSettings(sessionId);
  clearRevealed(sessionId);
  getIO().to(session.gamePin).emit("game:ended");

  await deleteSessionsForever([sessionId]);
  if (session.quizId) await cleanupQuizLeftovers(session.quizId);

  res.json({ success: true, message: "Session deleted" });
});

// PUBLIC — no login required, this is how students join
export const joinSession = asyncHandler(async (req: Request, res: Response) => {
  const { gamePin, displayName, deviceId } = req.body;

  if (!gamePin || !displayName) {
    throw new ApiError(400, "Game PIN and display name are required");
  }
  if (displayName.trim().length < 2) {
    throw new ApiError(400, "Display name must be at least 2 characters");
  }

  const session = await prisma.quizSession.findFirst({ where: { gamePin } });

  if (!session || session.deletedAt) throw new ApiError(404, "No active game found with that PIN");
  // Mid-join is allowed now, same as Regular QOD — only a truly finished game is off-limits.
  if (session.status === "ENDED") {
    throw new ApiError(400, "This game has already ended");
  }

  // A returning student on this device resumes their existing seat (same id, same
  // score) instead of getting a duplicate row. This is also what makes "remove a
  // student, then let them rejoin" work cleanly: once removed, their old row (and
  // its deviceId) is gone, so this lookup finds nothing next time and falls through
  // to create a brand-new one below.
  if (typeof deviceId === "string" && deviceId) {
    const existing = await prisma.participant.findFirst({
      where: { sessionId: session.id, deviceId },
    });
    if (existing) {
      res.status(200).json({
        success: true,
        data: {
          participantId: existing.id,
          sessionId: session.id,
          displayName: existing.displayName,
        },
      });
      return;
    }
  }

  const participant = await prisma.participant.create({
    data: { sessionId: session.id, displayName: displayName.trim(), deviceId: deviceId || null },
  });

  getIO().to(gamePin).emit("participant-joined", {
    participantId: participant.id,
    displayName: participant.displayName,
  });

  res.status(201).json({
    success: true,
    data: {
      participantId: participant.id,
      sessionId: session.id,
      displayName: participant.displayName,
    },
  });
});

// PUBLIC — a student fixes their own name while the lobby is still waiting.
export const renameParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, participantId } = req.params;
  const { displayName } = req.body;

  if (!displayName || displayName.trim().length < 2) {
    throw new ApiError(400, "Display name must be at least 2 characters");
  }

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  if (session.status === "ACTIVE") {
    throw new ApiError(400, "You can no longer change your name while the game is in progress");
  }
  if (session.status === "ENDED" && !getSessionSettings(sessionId).allowNameEdit) {
    throw new ApiError(403, "The host has disabled name editing right now");
  }

  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: { displayName: displayName.trim() },
  });

  getIO().to(session.gamePin).emit("participant-renamed", {
    participantId: updated.id,
    displayName: updated.displayName,
  });

  res.json({ success: true, data: { participantId: updated.id, displayName: updated.displayName } });
});

// Host corrects a participant's name directly on a finished report — a one-off data
// fix, unrelated to the live renameParticipant flow (WAITING/ACTIVE rules, the
// Allow-name-editing toggle). Only works once the game has ENDED.
export const renameReportParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, participantId } = req.params;
  const { displayName } = req.body;

  if (!displayName || displayName.trim().length < 2) {
    throw new ApiError(400, "Display name must be at least 2 characters");
  }

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: { quiz: true },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.quiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");
  if (session.status !== "ENDED") throw new ApiError(400, "This report is not available yet");

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: { displayName: displayName.trim() },
  });

  res.json({ success: true, data: { participantId: updated.id, displayName: updated.displayName } });
});

// Host removes one student — e.g. an inappropriate name. A hard delete, not Trash:
// their answers go with them (cascade), and removing them does NOT block them from
// joining again — a fresh join just creates a brand-new row, same as any new student.
export const removeParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, participantId } = req.params;

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: { quiz: true },
  });
  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.quiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new ApiError(404, "Participant not found");

  await prisma.participant.delete({ where: { id: participantId } }); // cascades their answers

  // Only broadcast while the game is actually live. An ENDED session's gamePin can
  // now belong to a completely different, currently-running session (see the
  // partial-unique-index PIN-reuse fix) — notifying that room here would be a
  // cross-contamination bug, not a real update for anyone watching it.
  if (session.status !== "ENDED") {
    getIO().to(session.gamePin).emit("participant-removed", { participantId });
  }

  res.json({ success: true, message: "Participant removed" });
});


export const getSessionParticipants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: true,
      participants: { orderBy: { joinedAt: "asc" } },
    },
  });

  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");
  const ownerId = session.quiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) {
    throw new ApiError(403, "You do not have access to this session");
  }

  res.json({ success: true, data: { ...session, settings: getSessionSettings(sessionId) } });
});

// Full results of a finished game: summary, every player, every question.
export const getSessionReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: { quiz: { select: { id: true, title: true, topic: true, hostId: true } } },
  });

  if (!session || session.deletedAt) throw new ApiError(404, "Session not found");

  // session.hostId (snapshotted the moment the game ended) is what keeps this
  // check working even after the quiz itself has been permanently deleted.
  const ownerId = session.quiz?.hostId ?? session.hostId;
  if (ownerId !== req.hostId) throw new ApiError(403, "You do not have access to this session");
  if (session.status !== "ENDED") throw new ApiError(400, "The report is available once the game has ended");

  const [ranked, answers, sessionQuestions] = await Promise.all([
    getRankedParticipants(sessionId),
    prisma.answer.findMany({
      where: { participant: { sessionId } },
      select: {
        participantId: true,
        questionId: true,
        selectedOptionId: true,
        isCorrect: true,
        pointsAwarded: true,
        timeTakenMs: true,
      },
    }),
    prisma.sessionQuestion.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
  ]);

  // Every question is now fully self-contained in SessionQuestion's own snapshot
  // columns — no live Quiz/Question join needed at all, so a deleted quiz (or an
  // edited question) can never change or break an existing report again.
  const questions = sessionQuestions.map((sq, index) => ({
    id: sq.questionId,
    number: index + 1,
    text: sq.questionTextSnapshot,
    type: sq.questionTypeSnapshot,
    options: (sq.optionsSnapshot as { id: string; text: string; isCorrect: boolean; order: number }[]).sort(
      (a, b) => a.order - b.order
    ),
  }));

  const playerCount = ranked.length;
  const questionCount = questions.length;

  const answersByPlayer = new Map<string, typeof answers>();
  const answersByQuestion = new Map<string, typeof answers>();
  for (const a of answers) {
    const p = answersByPlayer.get(a.participantId);
    if (p) p.push(a);
    else answersByPlayer.set(a.participantId, [a]);

    const q = answersByQuestion.get(a.questionId);
    if (q) q.push(a);
    else answersByQuestion.set(a.questionId, [a]);
  }

  const players = ranked.map((p) => {
    const mine = answersByPlayer.get(p.participantId) ?? [];
    const correct = mine.filter((a) => a.isCorrect).length;
    const times = mine.map((a) => a.timeTakenMs).filter((t): t is number => t !== null);
    const avgTimeSec = times.length
      ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length / 100) / 10
      : null;

    return {
      participantId: p.participantId,
      displayName: p.displayName,
      score: p.score,
      rank: p.rank,
      correct,
      wrong: mine.length - correct,
      unanswered: Math.max(0, questionCount - mine.length),
      accuracy: questionCount ? Math.round((correct / questionCount) * 100) : 0,
      avgTimeSec,
      // Each answer this player gave, so the report can show right/wrong per question.
      answers: mine.map((a) => ({
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
        timeTakenMs: a.timeTakenMs,
      })),
    };
  });

  const reportQuestions = questions.map((q) => {
    const qa = answersByQuestion.get(q.id) ?? [];
    const correct = qa.filter((a) => a.isCorrect).length;
    return {
      id: q.id,
      number: q.number,
      text: q.text,
      type: q.type,
      answered: qa.length,
      correct,
      wrong: qa.length - correct,
      unanswered: Math.max(0, playerCount - qa.length),
      percentCorrect: playerCount ? Math.round((correct / playerCount) * 100) : 0,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        count: qa.filter((a) => a.selectedOptionId === o.id).length,
      })),
    };
  });

  const totalCorrect = players.reduce((sum, p) => sum + p.correct, 0);
  const totalScore = players.reduce((sum, p) => sum + p.score, 0);

  res.json({
    success: true,
    data: {
      session: {
        id: session.id,
        gamePin: session.gamePin,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        quizId: session.quiz?.id ?? null,
        quizTitle: session.quiz?.title ?? session.quizTitleSnapshot ?? "Deleted quiz",
        topic: session.quiz?.topic ?? session.quizTopicSnapshot ?? null,
      },
      summary: {
        playerCount,
        questionCount,
        averageScore: playerCount ? Math.round(totalScore / playerCount) : 0,
        accuracy: playerCount && questionCount ? Math.round((totalCorrect / (playerCount * questionCount)) * 100) : 0,
        first: players[0] ? { displayName: players[0].displayName, score: players[0].score } : null,
        last:
          players.length > 1
            ? { displayName: players[players.length - 1].displayName, score: players[players.length - 1].score }
            : null,
      },
      players,
      questions: reportQuestions,
    },
  });
});