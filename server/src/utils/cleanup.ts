import prisma from "../config/prisma";

// Removes old hidden versions of questions that no remaining game still references —
// neither through an answer NOR through having been asked-but-unanswered. The
// second check is new: previously an unanswered-but-asked question could in theory
// still be cleaned up here (it only survived by accident, via the DB's old Restrict
// constraint blocking the delete outright) — now that the constraint is gone, this
// check is what actually protects it.
export async function cleanupQuizLeftovers(quizId: string) {
  const candidates = await prisma.question.findMany({
    where: { quizId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (candidates.length === 0) return;
  const ids = candidates.map((q) => q.id);

  const [answered, asked] = await Promise.all([
    prisma.answer.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
    prisma.sessionQuestion.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
  ]);
  const stillReferenced = new Set([...answered.map((a) => a.questionId), ...asked.map((a) => a.questionId)]);
  const deletable = ids.filter((id) => !stillReferenced.has(id));

  if (deletable.length > 0) {
    await prisma.question.deleteMany({ where: { id: { in: deletable } } });
  }
}

// Same idea for QOD: a question is only cleaned up once nothing — neither a
// response NOR an asked-but-unanswered QodSessionQuestion row — still points to it.
export async function cleanupQodQuizLeftovers(qodQuizId: string) {
  const candidates = await prisma.qodQuestion.findMany({
    where: { qodQuizId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (candidates.length === 0) return;
  const ids = candidates.map((q) => q.id);

  const [responded, asked] = await Promise.all([
    prisma.qodResponse.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
    prisma.qodSessionQuestion.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
  ]);
  const stillReferenced = new Set([...responded.map((r) => r.questionId), ...asked.map((a) => a.questionId)]);
  const deletable = ids.filter((id) => !stillReferenced.has(id));

  if (deletable.length > 0) {
    await prisma.qodQuestion.deleteMany({ where: { id: { in: deletable } } });
  }
}