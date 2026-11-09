import prisma from "../config/prisma";
import { DAY_MS, deleteQuizForever, deleteQodQuizForever, deleteSessionsForever, deleteQodSessionsForever } from "./trash";

export const ACCOUNT_DELETE_GRACE_DAYS = 30;

// Permanently removes a host and everything they own: every quiz (with its games,
// questions, options), every QOD quiz (same), AND — unlike a normal quiz/QOD
// permanent delete — any reports that were left behind, detached, by those two
// steps. deleteQuizForever/deleteQodQuizForever deliberately preserve a finished
// game's report when the quiz alone is deleted; a full account wipe is the one
// exception to that, matched here by the hostId snapshot each report carries
// rather than by a (now possibly gone) quiz relation. Categories need no manual
// step — Category.hostId is onDelete: Cascade. Quiz/QodQuiz -> Host is NOT
// cascading (a required relation with no onDelete specified defaults to Restrict),
// which is exactly why each quiz has to go first, one at a time, before the host
// row itself.
export async function deleteHostForever(hostId: string) {
  const [quizzes, qodQuizzes] = await Promise.all([
    prisma.quiz.findMany({ where: { hostId }, select: { id: true } }),
    prisma.qodQuiz.findMany({ where: { hostId }, select: { id: true } }),
  ]);

  for (const q of quizzes) await deleteQuizForever(q.id);
  for (const q of qodQuizzes) await deleteQodQuizForever(q.id);

  const [orphanedSessions, orphanedQodSessions] = await Promise.all([
    prisma.quizSession.findMany({ where: { hostId }, select: { id: true } }),
    prisma.qodSession.findMany({ where: { hostId }, select: { id: true } }),
  ]);
  await deleteSessionsForever(orphanedSessions.map((s) => s.id));
  await deleteQodSessionsForever(orphanedQodSessions.map((s) => s.id));

  await prisma.host.delete({ where: { id: hostId } });
}

// Sweeps every account whose 30-day grace period has passed. There's no cron job in
// this project, so — same spirit as purgeExpiredTrash — this runs opportunistically
// at login and register time instead of on a schedule.
export async function purgeExpiredHosts() {
  try {
    const cutoff = new Date(Date.now() - ACCOUNT_DELETE_GRACE_DAYS * DAY_MS);
    const expired = await prisma.host.findMany({
      where: { deletedAt: { not: null, lte: cutoff } },
      select: { id: true },
    });
    for (const h of expired) {
      await deleteHostForever(h.id);
    }
  } catch (err) {
    console.error("Host auto-delete failed:", err);
  }
}