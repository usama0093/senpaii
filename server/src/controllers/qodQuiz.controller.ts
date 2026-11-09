import { Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { resolveCategory } from "../utils/categories";
import { deleteQodSessionsForever } from "../utils/trash";

export const createQodQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, topic, category } = req.body;

  if (typeof title !== "string" || !title.trim()) {
    throw new ApiError(400, "Title is required");
  }

  const qodQuiz = await prisma.qodQuiz.create({
    data: {
      hostId: req.hostId!,
      title: title.trim(),
      description,
      topic: typeof topic === "string" && topic.trim() ? topic.trim() : null,
      category: await resolveCategory(req.hostId!, category, "QOD"),
    },
  });

  res.status(201).json({ success: true, data: qodQuiz });
});

export const getQodQuizzes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const qodQuizzes = await prisma.qodQuiz.findMany({
    where: { hostId: req.hostId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: { where: { deletedAt: null } } } } },
  });

  res.json({ success: true, data: qodQuizzes });
});

export const getQodQuizById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const qodQuiz = await prisma.qodQuiz.findUnique({
    where: { id: req.params.id },
    include: {
      questions: { where: { deletedAt: null }, orderBy: { order: "asc" } },
    },
  });

  if (!qodQuiz || qodQuiz.deletedAt) throw new ApiError(404, "QOD quiz not found");
  if (qodQuiz.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this QOD quiz");

  res.json({ success: true, data: qodQuiz });
});

export const updateQodQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.qodQuiz.findUnique({ where: { id: req.params.id } });

  if (!existing || existing.deletedAt) throw new ApiError(404, "QOD quiz not found");
  if (existing.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this QOD quiz");

  const { title, description, topic, category, isFavorite } = req.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    throw new ApiError(400, "Title is required");
  }

  const qodQuiz = await prisma.qodQuiz.update({
    where: { id: req.params.id },
    data: {
      title: title !== undefined ? title.trim() : undefined,
      description,
      // An empty topic clears it; leaving the field out keeps it unchanged.
      topic: typeof topic === "string" ? topic.trim() || null : undefined,
      category: category !== undefined ? await resolveCategory(req.hostId!, category, "QOD") : undefined,
      isFavorite: typeof isFavorite === "boolean" ? isFavorite : undefined,
    },
  });

  res.json({ success: true, data: qodQuiz });
});

// Moves the QOD quiz to Trash. Its finished sessions (reports) stay available,
// same as Quiz Session's deleteQuiz. Sessions that never started (an opened lobby)
// have nothing worth keeping, so those are removed completely first.
export const deleteQodQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.qodQuiz.findUnique({ where: { id: req.params.id } });

  if (!existing || existing.deletedAt) throw new ApiError(404, "QOD quiz not found");
  if (existing.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this QOD quiz");

  const lobbies = await prisma.qodSession.findMany({
    where: { qodQuizId: req.params.id, status: "WAITING" },
    select: { id: true },
  });
  await deleteQodSessionsForever(lobbies.map((s) => s.id));

  await prisma.qodQuiz.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Moved to Trash" });
});

// Copies a QOD quiz with all its current questions as a brand-new quiz.
export const duplicateQodQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const source = await prisma.qodQuiz.findUnique({
    where: { id: req.params.id },
    include: { questions: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
  });

  if (!source || source.deletedAt) throw new ApiError(404, "QOD quiz not found");
  if (source.hostId !== req.hostId) throw new ApiError(403, "You do not have access to this QOD quiz");

  const copy = await prisma.qodQuiz.create({
    data: {
      hostId: source.hostId,
      title: `${source.title} (Copy)`,
      description: source.description,
      topic: source.topic,
      category: source.category,
      questions: {
        create: source.questions.map((q, index) => ({
          text: q.text,
          timeLimit: q.timeLimit,
          order: index,
        })),
      },
    },
    include: { _count: { select: { questions: true } } },
  });

  res.status(201).json({ success: true, data: copy });
});