import prisma from "../config/prisma";
import { cleanupQuizLeftovers, cleanupQodQuizLeftovers } from "./cleanup";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Permanently removes games (with their players and answers) from the database.
export async function deleteSessionsForever(sessionIds: string[]) {
  if (sessionIds.length === 0) return;

  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { participant: { sessionId: { in: sessionIds } } } }),
    prisma.participant.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.quizSession.deleteMany({ where: { id: { in: sessionIds } } }),
  ]);
}

// Permanently removes a quiz together with only its UNPLAYED games (lobbies, or
// games left mid-play with no report). A finished game (ENDED — its report) is
// deliberately left alone here, whether it's sitting in Reports or still in Report
// Trash: it already carries everything it needs (hostId + quiz title/topic
// snapshot, per-question/per-answer snapshots) to keep working on its own.
// Deleting the quiz just detaches it (quizId -> null, via onDelete: SetNull).
export async function deleteQuizForever(quizId: string) {
  const unplayed = await prisma.quizSession.findMany({
    where: { quizId, status: { not: "ENDED" } },
    select: { id: true },
  });
  await deleteSessionsForever(unplayed.map((g) => g.id));
  await prisma.quiz.delete({ where: { id: quizId } }); // its questions and options go with it
}

// Permanently removes QOD sessions. The schema's cascading deletes (QodSession →
// QodParticipant → QodResponse are all onDelete: Cascade) mean a plain deleteMany
// is enough here — no manual multi-step transaction needed, unlike Quiz Session's
// Answer/Participant tables above.
export async function deleteQodSessionsForever(sessionIds: string[]) {
  if (sessionIds.length === 0) return;
  await prisma.qodSession.deleteMany({ where: { id: { in: sessionIds } } });
}

// Same principle as deleteQuizForever: only unplayed (non-ENDED) sessions are
// removed here. A finished session's report, wherever it's sitting, survives the
// quiz being deleted and simply detaches (qodQuizId -> null).
export async function deleteQodQuizForever(qodQuizId: string) {
  const unplayed = await prisma.qodSession.findMany({
    where: { qodQuizId, status: { not: "ENDED" } },
    select: { id: true },
  });
  await deleteQodSessionsForever(unplayed.map((s) => s.id));
  await prisma.qodQuiz.delete({ where: { id: qodQuizId } }); // its questions go with it
}

// How many items an auto-delete setting of `days` would remove right now.
// Counts Quiz Session and QOD items together — Trash has one shared setting.
// The OR in each session count also catches a report whose quiz has since been
// permanently deleted (quiz is null on that row) — a plain `quiz: { hostId }`
// filter would otherwise silently skip it forever.
export async function countExpired(hostId: string, days: number) {
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const [sessions, quizzes, qodSessions, qodQuizzes] = await Promise.all([
    prisma.quizSession.count({
      where: { deletedAt: { not: null, lte: cutoff }, OR: [{ quiz: { hostId } }, { hostId }] },
    }),
    prisma.quiz.count({
      where: {
        hostId,
        deletedAt: { not: null, lte: cutoff },
        sessions: { none: { OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }] } },
      },
    }),
    prisma.qodSession.count({
      where: { deletedAt: { not: null, lte: cutoff }, OR: [{ qodQuiz: { hostId } }, { hostId }] },
    }),
    prisma.qodQuiz.count({
      where: {
        hostId,
        deletedAt: { not: null, lte: cutoff },
        sessions: { none: { OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }] } },
      },
    }),
  ]);

  return { sessions, quizzes, qodSessions, qodQuizzes, total: sessions + quizzes + qodSessions + qodQuizzes };
}

// Deletes whatever has sat in Trash longer than the host's auto-delete setting.
// Runs when the Trash page or the quiz list is opened. Does nothing if auto-delete is off.
export async function purgeExpiredTrash(hostId: string) {
  try {
    const host = await prisma.host.findUnique({ where: { id: hostId }, select: { trashAutoDeleteDays: true } });
    if (!host || !host.trashAutoDeleteDays) return;

    const cutoff = new Date(Date.now() - host.trashAutoDeleteDays * DAY_MS);

    // 1) Trashed games that are old enough. The OR also catches a report whose
    // quiz has already been permanently deleted (quiz -> null on that row).
    const sessions = await prisma.quizSession.findMany({
      where: { deletedAt: { not: null, lte: cutoff }, OR: [{ quiz: { hostId } }, { hostId }] },
      select: { id: true, quizId: true },
    });
    await deleteSessionsForever(sessions.map((s) => s.id));
    const quizIdsToClean = Array.from(
      new Set(sessions.map((s) => s.quizId).filter((id): id is string => id !== null))
    );
    for (const quizId of quizIdsToClean) {
      await cleanupQuizLeftovers(quizId);
    }

    // 2) Trashed quizzes that are old enough and have no games left.
    //    A quiz that still has reports in Reports is never removed automatically.
    const quizzes = await prisma.quiz.findMany({
      where: { hostId, deletedAt: { not: null, lte: cutoff }, sessions: { none: {} } },
      select: { id: true },
    });
    for (const q of quizzes) {
      await deleteQuizForever(q.id);
    }

    // 3) Trashed QOD reports that are old enough (same orphaned-report fix as above)
    const qodSessions = await prisma.qodSession.findMany({
      where: { deletedAt: { not: null, lte: cutoff }, OR: [{ qodQuiz: { hostId } }, { hostId }] },
      select: { id: true, qodQuizId: true },
    });
    await deleteQodSessionsForever(qodSessions.map((s) => s.id));
    const qodQuizIdsToClean = Array.from(
      new Set(qodSessions.map((s) => s.qodQuizId).filter((id): id is string => id !== null))
    );
    for (const qodQuizId of qodQuizIdsToClean) {
      await cleanupQodQuizLeftovers(qodQuizId);
    }

    // 4) Trashed QOD quizzes that are old enough and have no sessions left.
    const qodQuizzes = await prisma.qodQuiz.findMany({
      where: { hostId, deletedAt: { not: null, lte: cutoff }, sessions: { none: {} } },
      select: { id: true },
    });
    for (const q of qodQuizzes) {
      await deleteQodQuizForever(q.id);
    }
  } catch (err) {
    console.error("Trash auto-delete failed:", err);
  }
}