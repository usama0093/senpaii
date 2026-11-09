import { Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";

async function getOwnedQuiz(quizId: string, hostId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz || quiz.deletedAt) throw new ApiError(404, "Quiz not found");
  if (quiz.hostId !== hostId) throw new ApiError(403, "You do not have access to this quiz");
  return quiz;
}

function validateOptions(options: any, expectedCount: number) {
  if (!Array.isArray(options) || options.length !== expectedCount) {
    throw new ApiError(400, `Exactly ${expectedCount} options are required for this question type`);
  }
  const correctCount = options.filter((o: any) => o.isCorrect).length;
  if (correctCount !== 1) {
    throw new ApiError(400, "Exactly one option must be marked correct");
  }
}

export const addQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const { text, timeLimit, points, type, options } = req.body;
  const questionType = type === "TRUE_FALSE" ? "TRUE_FALSE" : "MULTIPLE_CHOICE";

  if (!text) throw new ApiError(400, "Question text is required");
  validateOptions(options, questionType === "TRUE_FALSE" ? 2 : 4);

  // Counts deleted questions too, so new questions never reuse an order number.
  const questionCount = await prisma.question.count({ where: { quizId } });

  const question = await prisma.question.create({
    data: {
      quizId,
      type: questionType,
      text,
      timeLimit: timeLimit || 20,
      points: points || 1000,
      order: questionCount,
      options: {
        create: options.map((o: any, index: number) => ({ text: o.text, isCorrect: o.isCorrect, order: index })),
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  res.status(201).json({ success: true, data: question });
});

export const updateQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId, questionId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!existing || existing.quizId !== quizId || existing.deletedAt) {
    throw new ApiError(404, "Question not found");
  }

  const { text, timeLimit, points, options } = req.body;

  // Type is fixed once a question is created.
  if (options) validateOptions(options, existing.type === "TRUE_FALSE" ? 2 : 4);

  const newOptions = (options ?? existing.options).map((o: any, index: number) => ({
    text: o.text,
    isCorrect: o.isCorrect,
    order: index,
  }));

  const answerCount = await prisma.answer.count({ where: { questionId } });

  if (answerCount > 0) {
    // Already played: keep the old version for old reports, hide it,
    // and create the edited version in the same position.
    const replacement = await prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id: questionId }, data: { deletedAt: new Date() } });
      return tx.question.create({
        data: {
          quizId,
          type: existing.type,
          text: text ?? existing.text,
          timeLimit: timeLimit ?? existing.timeLimit,
          points: points ?? existing.points,
          order: existing.order,
          options: { create: newOptions },
        },
        include: { options: { orderBy: { order: "asc" } } },
      });
    });
    res.json({ success: true, data: replacement });
    return;
  }

  // Never played: safe to edit in place.
  if (options) await prisma.questionOption.deleteMany({ where: { questionId } });

  const question = await prisma.question.update({
    where: { id: questionId },
    data: {
      text,
      timeLimit,
      points,
      ...(options && { options: { create: newOptions } }),
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  res.json({ success: true, data: question });
});

// Soft delete: the row and its answers stay so old reports don't change.
export const deleteQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId, questionId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const result = await prisma.question.updateMany({
    where: { id: questionId, quizId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new ApiError(404, "Question not found");

  res.json({ success: true, message: "Question deleted" });
});

export const reorderQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) throw new ApiError(400, "orderedIds must be an array of question IDs");

  // The list must contain exactly this quiz's current questions, nothing else.
  const current = await prisma.question.findMany({
    where: { quizId, deletedAt: null },
    select: { id: true },
  });
  const currentIds = new Set(current.map((q) => q.id));
  if (orderedIds.length !== currentIds.size || !orderedIds.every((id: string) => currentIds.has(id))) {
    throw new ApiError(400, "orderedIds must list every question in this quiz exactly once");
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) => prisma.question.update({ where: { id }, data: { order: index } }))
  );

  res.json({ success: true, message: "Questions reordered" });
});

// Copies one question and places the copy right after the original.
export const duplicateQuestion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId, questionId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const source = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!source || source.quizId !== quizId || source.deletedAt) {
    throw new ApiError(404, "Question not found");
  }

  const visible = await prisma.question.findMany({
    where: { quizId, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const totalRows = await prisma.question.count({ where: { quizId } });

  // Create the copy with a temporary unique order, then renumber everything.
  const copy = await prisma.question.create({
    data: {
      quizId,
      type: source.type,
      text: source.text,
      timeLimit: source.timeLimit,
      points: source.points,
      order: totalRows,
      options: {
        create: source.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, order: index })),
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const ids = visible.map((q) => q.id);
  ids.splice(ids.indexOf(questionId) + 1, 0, copy.id);

  await prisma.$transaction(
    ids.map((id, index) => prisma.question.update({ where: { id }, data: { order: index } }))
  );

  res.status(201).json({ success: true, data: copy });
});

// Applies a time limit and/or points to the chosen questions at once.
export const bulkUpdateQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { quizId } = req.params;
  await getOwnedQuiz(quizId, req.hostId!);

  const { questionIds, timeLimit, points } = req.body;

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new ApiError(400, "Select at least one question");
  }
  if (timeLimit === undefined && points === undefined) {
    throw new ApiError(400, "Choose a time limit or points to apply");
  }
  if (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 5 || timeLimit > 300)) {
    throw new ApiError(400, "Time limit must be between 5 and 300 seconds");
  }
  if (points !== undefined && (!Number.isInteger(points) || points < 1 || points > 100000)) {
    throw new ApiError(400, "Points must be a positive whole number");
  }

  const result = await prisma.question.updateMany({
    where: { id: { in: questionIds }, quizId, deletedAt: null },
    data: {
      ...(timeLimit !== undefined && { timeLimit }),
      ...(points !== undefined && { points }),
    },
  });

  res.json({ success: true, data: { updated: result.count } });
});