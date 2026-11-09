import prisma from "../config/prisma";

const confirm = process.argv.includes("--confirm");

async function main() {
  const hiddenSessions = await prisma.quizSession.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true },
  });
  const sessionIds = hiddenSessions.map((s) => s.id);

  const answerCount = await prisma.answer.count({ where: { participant: { sessionId: { in: sessionIds } } } });
  const playerCount = await prisma.participant.count({ where: { sessionId: { in: sessionIds } } });

  console.log("Hidden (deleted) games found:", sessionIds.length);
  console.log("Their players:", playerCount, "| their answers:", answerCount);

  if (!confirm) {
    console.log("\nDry run — nothing was deleted. Run again with --confirm to delete this data permanently.");
    return;
  }

  await prisma.answer.deleteMany({ where: { participant: { sessionId: { in: sessionIds } } } });
  await prisma.participant.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.quizSession.deleteMany({ where: { id: { in: sessionIds } } });

  // Hidden old question versions that nothing points to any more
  const questions = await prisma.question.deleteMany({
    where: { deletedAt: { not: null }, answers: { none: {} } },
  });

  // Hidden quizzes that have no games left
  const emptyQuizzes = await prisma.quiz.findMany({
    where: { deletedAt: { not: null }, sessions: { none: {} } },
    select: { id: true },
  });
  await prisma.quiz.deleteMany({ where: { id: { in: emptyQuizzes.map((q) => q.id) } } });

  console.log("\nDeleted games:", sessionIds.length);
  console.log("Deleted hidden questions:", questions.count);
  console.log("Deleted hidden quizzes:", emptyQuizzes.length);
}

main()
  .catch((err) => console.error(err))
  .finally(() => prisma.$disconnect());