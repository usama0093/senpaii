import { Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";

async function getOwnedQodQuiz(qodQuizId: string, hostId: string) {
  const qodQuiz = await prisma.qodQuiz.findUnique({ where: { id: qodQuizId } });
  if (!qodQuiz || qodQuiz.deletedAt) throw new ApiError(404, "QOD quiz not found");
  if (qodQuiz.hostId !== hostId) throw new ApiError(403, "You do not have access to this QOD quiz");
  return qodQuiz;
}

export const addQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId } = req.params;
  await getOwnedQodQuiz(qodQuizId, req.hostId!);

  const { text, timeLimit } = req.body;
  if (typeof text !== "string" || !text.trim()) {
    throw new ApiError(400, "Question text is required");
  }

  const count = await prisma.qodQuestion.count({ where: { qodQuizId, deletedAt: null } });

  const question = await prisma.qodQuestion.create({
    data: {
      qodQuizId,
      text: text.trim(),
      timeLimit: typeof timeLimit === "number" ? timeLimit : null,
      order: count,
    },
  });

  res.status(201).json({ success: true, data: question });
});

export const updateQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId, questionId } = req.params;
  await getOwnedQodQuiz(qodQuizId, req.hostId!);

  const existing = await prisma.qodQuestion.findUnique({ where: { id: questionId } });
  if (!existing || existing.deletedAt || existing.qodQuizId !== qodQuizId) {
    throw new ApiError(404, "Question not found");
  }

  const { text, timeLimit } = req.body;
  if (text !== undefined && (typeof text !== "string" || !text.trim())) {
    throw new ApiError(400, "Question text is required");
  }

  const question = await prisma.qodQuestion.update({
    where: { id: questionId },
    data: {
      text: text !== undefined ? text.trim() : undefined,
      timeLimit: timeLimit !== undefined ? timeLimit : undefined,
    },
  });

  res.json({ success: true, data: question });
});

// Soft delete, same reasoning as regular quiz questions: once QOD play sessions exist
// (step 5), a past response must keep referring to the exact question version it was asked.
export const deleteQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId, questionId } = req.params;
  await getOwnedQodQuiz(qodQuizId, req.hostId!);

  const existing = await prisma.qodQuestion.findUnique({ where: { id: questionId } });
  if (!existing || existing.deletedAt || existing.qodQuizId !== qodQuizId) {
    throw new ApiError(404, "Question not found");
  }

  await prisma.qodQuestion.update({ where: { id: questionId }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Question deleted" });
});

export const reorderQodQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId } = req.params;
  await getOwnedQodQuiz(qodQuizId, req.hostId!);

  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ApiError(400, "orderedIds must be a non-empty array");
  }

  const current = await prisma.qodQuestion.findMany({
    where: { qodQuizId, deletedAt: null },
    select: { id: true },
  });
  const currentIds = new Set(current.map((q) => q.id));

  if (orderedIds.length !== currentIds.size || !orderedIds.every((id: string) => currentIds.has(id))) {
    throw new ApiError(400, "orderedIds must list every current question exactly once");
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.qodQuestion.update({ where: { id }, data: { order: index } })
    )
  );

  res.json({ success: true, message: "Order saved" });
});

export const duplicateQodQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { qodQuizId, questionId } = req.params;
  await getOwnedQodQuiz(qodQuizId, req.hostId!);

  const source = await prisma.qodQuestion.findUnique({ where: { id: questionId } });
  if (!source || source.deletedAt || source.qodQuizId !== qodQuizId) {
    throw new ApiError(404, "Question not found");
  }

  const count = await prisma.qodQuestion.count({ where: { qodQuizId, deletedAt: null } });

  const copy = await prisma.qodQuestion.create({
    data: {
      qodQuizId,
      text: source.text,
      timeLimit: source.timeLimit,
      order: count,
    },
  });

  res.status(201).json({ success: true, data: copy });
});