import { Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { resolveCategory } from "../utils/categories";
import { cleanupQuizLeftovers, cleanupQodQuizLeftovers } from "../utils/cleanup";
import {
  DAY_MS,
  countExpired,
  deleteQuizForever,
  deleteSessionsForever,
  purgeExpiredTrash,
  deleteQodQuizForever,
  deleteQodSessionsForever,
} from "../utils/trash";

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS).toISOString();
const later = (a: Date, b: Date) => (a.getTime() > b.getTime() ? a : b);

// Everything in Trash, plus the auto-delete setting.
export const getTrash = asyncHandler(async (req: AuthRequest, res: Response) => {
  const hostId = req.hostId!;

  await purgeExpiredTrash(hostId);

  const host = await prisma.host.findUnique({ where: { id: hostId }, select: { trashAutoDeleteDays: true } });
  const days = host?.trashAutoDeleteDays ?? null;

  const [quizzes, sessions, qodQuizzes, qodSessions] = await Promise.all([
    prisma.quiz.findMany({
      where: { hostId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: {
        _count: { select: { questions: { where: { deletedAt: null } } } },
        sessions: { select: { deletedAt: true, status: true } },
      },
    }),
    prisma.quizSession.findMany({
      where: { deletedAt: { not: null }, OR: [{ quiz: { hostId } }, { hostId }] },
      orderBy: { deletedAt: "desc" },
      include: {
        quiz: { select: { id: true, title: true, deletedAt: true } },
        _count: { select: { participants: true } },
      },
    }),
    prisma.qodQuiz.findMany({
      where: { hostId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: {
        _count: { select: { questions: { where: { deletedAt: null } } } },
        sessions: { select: { deletedAt: true, status: true } },
      },
    }),
    prisma.qodSession.findMany({
      where: { deletedAt: { not: null }, OR: [{ qodQuiz: { hostId } }, { hostId }] },
      orderBy: { deletedAt: "desc" },
      include: {
        qodQuiz: { select: { id: true, title: true, deletedAt: true } },
        _count: { select: { participants: true } },
      },
    }),
  ]);

  const quizItems = quizzes.map((q) => {
    const quizDeletedAt = q.deletedAt as Date;
    const liveGames = q.sessions.filter((s) => s.deletedAt === null).length;
    const reportCount = q.sessions.filter((s) => s.status === "ENDED").length;

    // The latest moment this quiz, or one of its trashed reports, was thrown away.
    const latest = q.sessions.reduce(
      (acc, s) => (s.deletedAt ? later(acc, s.deletedAt) : acc),
      quizDeletedAt
    );

    return {
      id: q.id,
      title: q.title,
      topic: q.topic,
      category: q.category,
      questionCount: q._count.questions,
      reportCount,
      deletedAt: quizDeletedAt,
      // No date while it still has reports in Reports: those keep it alive.
      autoDeleteOn: days && liveGames === 0 ? addDays(latest, days) : null,
    };
  });

  const sessionItems = sessions.map((s) => ({
    id: s.id,
    title: s.quiz?.title ?? s.quizTitleSnapshot ?? "Deleted quiz",
    quizId: s.quiz?.id ?? null,
    quizInTrash: s.quiz ? s.quiz.deletedAt !== null : false,
    players: s._count.participants,
    playedAt: s.endedAt || s.createdAt,
    deletedAt: s.deletedAt as Date,
    autoDeleteOn: days ? addDays(s.deletedAt as Date, days) : null,
  }));

  // Same shape as above, built from QOD's own tables.
  const qodQuizItems = qodQuizzes.map((q) => {
    const quizDeletedAt = q.deletedAt as Date;
    const liveSessions = q.sessions.filter((s) => s.deletedAt === null).length;
    const reportCount = q.sessions.filter((s) => s.status === "ENDED").length;

    const latest = q.sessions.reduce(
      (acc, s) => (s.deletedAt ? later(acc, s.deletedAt) : acc),
      quizDeletedAt
    );

    return {
      id: q.id,
      title: q.title,
      topic: q.topic,
      category: q.category,
      questionCount: q._count.questions,
      reportCount,
      deletedAt: quizDeletedAt,
      autoDeleteOn: days && liveSessions === 0 ? addDays(latest, days) : null,
    };
  });

  const qodSessionItems = qodSessions.map((s) => ({
    id: s.id,
    title: s.qodQuiz?.title ?? s.quizTitleSnapshot ?? "Deleted QOD quiz",
    quizId: s.qodQuiz?.id ?? null,
    quizInTrash: s.qodQuiz ? s.qodQuiz.deletedAt !== null : false,
    players: s._count.participants,
    playedAt: s.endedAt || s.createdAt,
    deletedAt: s.deletedAt as Date,
    autoDeleteOn: days ? addDays(s.deletedAt as Date, days) : null,
  }));

  res.json({
    success: true,
    data: {
      quizzes: quizItems,
      sessions: sessionItems,
      qodQuizzes: qodQuizItems,
      qodSessions: qodSessionItems,
      settings: { autoDeleteDays: days },
    },
  });
});

// Sets the auto-delete period (null = off). If it would delete items right away,
// the first call only reports how many; the page asks you, then calls again with confirm.
export const updateTrashSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const hostId = req.hostId!;
  const { autoDeleteDays, confirm } = req.body;

  const days = autoDeleteDays === undefined || autoDeleteDays === null ? null : autoDeleteDays;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw new ApiError(400, "Choose a number of days between 1 and 365");
  }

  if (days !== null && !confirm) {
    const expired = await countExpired(hostId, days);
    if (expired.total > 0) {
      res.json({ success: true, data: { saved: false, wouldDelete: expired.total } });
      return;
    }
  }

  await prisma.host.update({ where: { id: hostId }, data: { trashAutoDeleteDays: days } });
  await purgeExpiredTrash(hostId);

  res.json({ success: true, data: { saved: true, autoDeleteDays: days } });
});

// ---------- quizzes ----------

async function getTrashedQuiz(id: string, hostId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz || quiz.hostId !== hostId) throw new ApiError(404, "Quiz not found");
  if (!quiz.deletedAt) throw new ApiError(400, "This quiz is not in Trash");
  return quiz;
}

export const restoreQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quiz = await getTrashedQuiz(req.params.id, req.hostId!);

  // Brings its category back too, if you deleted that category meanwhile.
  const category = await resolveCategory(req.hostId!, quiz.category, "QUIZ");
  await prisma.quiz.update({ where: { id: quiz.id }, data: { deletedAt: null, category } });

  res.json({ success: true, message: "Quiz restored" });
});

// Deletes the quiz AND all its games/reports for good.
export const deleteQuizPermanently = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quiz = await getTrashedQuiz(req.params.id, req.hostId!);
  await deleteQuizForever(quiz.id);

  res.json({ success: true, message: "Quiz deleted permanently" });
});

export const emptyQuizzes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quizzes = await prisma.quiz.findMany({
    where: { hostId: req.hostId!, deletedAt: { not: null } },
    select: { id: true },
  });
  for (const q of quizzes) await deleteQuizForever(q.id);

  res.json({ success: true, data: { deleted: quizzes.length } });
});

// ---------- games (reports) ----------

async function getTrashedSession(id: string, hostId: string) {
  const session = await prisma.quizSession.findUnique({ where: { id }, include: { quiz: true } });
  const ownerId = session?.quiz?.hostId ?? session?.hostId;
  if (!session || ownerId !== hostId) throw new ApiError(404, "Report not found");
  if (!session.deletedAt) throw new ApiError(400, "This report is not in Trash");
  return session;
}

export const restoreSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getTrashedSession(req.params.id, req.hostId!);

  if (session.quiz?.deletedAt) {
    throw new ApiError(400, `Restore the quiz "${session.quiz.title}" first, then restore this report`);
  }
  // A permanently-deleted quiz (session.quiz is null) has nothing to restore to —
  // the report still restores fine on its own, it just no longer links to a live quiz.

  await prisma.quizSession.update({ where: { id: session.id }, data: { deletedAt: null } });

  res.json({ success: true, message: "Report restored" });
});

export const deleteSessionPermanently = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getTrashedSession(req.params.id, req.hostId!);

  await deleteSessionsForever([session.id]);
  if (session.quizId) await cleanupQuizLeftovers(session.quizId);

  res.json({ success: true, message: "Report deleted permanently" });
});


export const emptySessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.quizSession.findMany({
    where: { deletedAt: { not: null }, OR: [{ quiz: { hostId: req.hostId! } }, { hostId: req.hostId! }] },
    select: { id: true, quizId: true },
  });

  await deleteSessionsForever(sessions.map((s) => s.id));
  const quizIds = Array.from(new Set(sessions.map((s) => s.quizId).filter((id): id is string => id !== null)));
  for (const quizId of quizIds) {
    await cleanupQuizLeftovers(quizId);
  }

  res.json({ success: true, data: { deleted: sessions.length } });
});

// ---------- QOD quizzes ----------

async function getTrashedQodQuiz(id: string, hostId: string) {
  const qodQuiz = await prisma.qodQuiz.findUnique({ where: { id } });
  if (!qodQuiz || qodQuiz.hostId !== hostId) throw new ApiError(404, "QOD quiz not found");
  if (!qodQuiz.deletedAt) throw new ApiError(400, "This QOD quiz is not in Trash");
  return qodQuiz;
}

export const restoreQodQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const qodQuiz = await getTrashedQodQuiz(req.params.id, req.hostId!);

  const category = await resolveCategory(req.hostId!, qodQuiz.category, "QOD");
  await prisma.qodQuiz.update({ where: { id: qodQuiz.id }, data: { deletedAt: null, category } });

  res.json({ success: true, message: "QOD quiz restored" });
});

export const deleteQodQuizPermanently = asyncHandler(async (req: AuthRequest, res: Response) => {
  const qodQuiz = await getTrashedQodQuiz(req.params.id, req.hostId!);
  await deleteQodQuizForever(qodQuiz.id);

  res.json({ success: true, message: "QOD quiz deleted permanently" });
});

export const emptyQodQuizzes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const qodQuizzes = await prisma.qodQuiz.findMany({
    where: { hostId: req.hostId!, deletedAt: { not: null } },
    select: { id: true },
  });
  for (const q of qodQuizzes) await deleteQodQuizForever(q.id);

  res.json({ success: true, data: { deleted: qodQuizzes.length } });
});

// ---------- QOD reports (sessions) ----------

async function getTrashedQodSession(id: string, hostId: string) {
  const session = await prisma.qodSession.findUnique({ where: { id }, include: { qodQuiz: true } });
  const ownerId = session?.qodQuiz?.hostId ?? session?.hostId;
  if (!session || ownerId !== hostId) throw new ApiError(404, "Report not found");
  if (!session.deletedAt) throw new ApiError(400, "This report is not in Trash");
  return session;
}

export const restoreQodSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getTrashedQodSession(req.params.id, req.hostId!);

  if (session.qodQuiz?.deletedAt) {
    throw new ApiError(400, `Restore the QOD quiz "${session.qodQuiz.title}" first, then restore this report`);
  }

  await prisma.qodSession.update({ where: { id: session.id }, data: { deletedAt: null } });

  res.json({ success: true, message: "Report restored" });
});

export const deleteQodSessionPermanently = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await getTrashedQodSession(req.params.id, req.hostId!);

  await deleteQodSessionsForever([session.id]);
  if (session.qodQuizId) await cleanupQodQuizLeftovers(session.qodQuizId);

  res.json({ success: true, message: "Report deleted permanently" });
});

export const emptyQodSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.qodSession.findMany({
    where: { deletedAt: { not: null }, OR: [{ qodQuiz: { hostId: req.hostId! } }, { hostId: req.hostId! }] },
    select: { id: true, qodQuizId: true },
  });

  await deleteQodSessionsForever(sessions.map((s) => s.id));
  const qodQuizIds = Array.from(new Set(sessions.map((s) => s.qodQuizId).filter((id): id is string => id !== null)));
  for (const qodQuizId of qodQuizIds) {
    await cleanupQodQuizLeftovers(qodQuizId);
  }

  res.json({ success: true, data: { deleted: sessions.length } });
});