import prisma from "../config/prisma";

export interface RankedParticipant {
  participantId: string;
  displayName: string;
  score: number;
  rank: number;
}

// Highest score first. If scores are equal, the faster total answer time wins.
// Calculated fresh from the database every time.
export async function getRankedParticipants(sessionId: string): Promise<RankedParticipant[]> {
  const [participants, times] = await Promise.all([
    prisma.participant.findMany({ where: { sessionId } }),
    prisma.answer.groupBy({
      by: ["participantId"],
      where: { participant: { sessionId } },
      _sum: { timeTakenMs: true },
    }),
  ]);

  const timeById = new Map(times.map((t) => [t.participantId, t._sum.timeTakenMs ?? 0]));

  const sorted = participants
    .map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      score: p.score,
      // Players who never answered go last among equal scores.
      totalTimeMs: timeById.has(p.id) ? (timeById.get(p.id) as number) : Number.MAX_SAFE_INTEGER,
      joinedAt: p.joinedAt.getTime(),
    }))
    .sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);

  return sorted.map((p, index) => ({
    participantId: p.participantId,
    displayName: p.displayName,
    score: p.score,
    rank: index + 1,
  }));
}