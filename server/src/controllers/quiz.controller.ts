import { Response } from "express";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { resolveCategory } from "../utils/categories";
import { deleteSessionsForever, purgeExpiredTrash } from "../utils/trash";

// const DEFAULT_CATEGORY = "Generic";

// // Empty category → "Generic". Trimmed and kept to a sensible length.
// function cleanCategory(value: unknown): string {
//   return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : DEFAULT_CATEGORY;
// }

export const createQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, topic, category, timePerQuestion } = req.body;

  if (typeof title !== "string" || !title.trim()) {
    throw new ApiError(400, "Quiz title is required");
  }

  const quiz = await prisma.quiz.create({
    data: {
      hostId: req.hostId!,
      title: title.trim(),
      description,
      topic: typeof topic === "string" && topic.trim() ? topic.trim() : null,
      category: await resolveCategory(req.hostId!, category, "QUIZ"),
      timePerQuestion: timePerQuestion || 20,
    },
  });

  res.status(201).json({ success: true, data: quiz });
});

export const getQuizzes = asyncHandler(async (req: AuthRequest, res: Response) => {
  await purgeExpiredTrash(req.hostId!);
  const quizzes = await prisma.quiz.findMany({
    where: { hostId: req.hostId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: { where: { deletedAt: null } } } } },
  });

  res.json({ success: true, data: quizzes });
});

export const getQuizById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!quiz || quiz.deletedAt) {
    throw new ApiError(404, "Quiz not found");
  }
  if (quiz.hostId !== req.hostId) {
    throw new ApiError(403, "You do not have access to this quiz");
  }

  res.json({ success: true, data: quiz });
});

export const updateQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.quiz.findUnique({ where: { id: req.params.id } });

  if (!existing || existing.deletedAt) {
    throw new ApiError(404, "Quiz not found");
  }
  if (existing.hostId !== req.hostId) {
    throw new ApiError(403, "You do not have access to this quiz");
  }

  const { title, description, topic, category, isFavorite, timePerQuestion } = req.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    throw new ApiError(400, "Quiz title is required");
  }

  const quiz = await prisma.quiz.update({
    where: { id: req.params.id },
    data: {
      title: title !== undefined ? title.trim() : undefined,
      description,
      // An empty topic clears it; leaving the field out keeps it unchanged.
      topic: typeof topic === "string" ? topic.trim() || null : undefined,
      category: category !== undefined ? await resolveCategory(req.hostId!, category, "QUIZ") : undefined,
      isFavorite: typeof isFavorite === "boolean" ? isFavorite : undefined,
      timePerQuestion,
    },
  });

  res.json({ success: true, data: quiz });
});

// // Never played → deleted completely.
// // Played → only hidden from the dashboard, because its reports need the data.
// // (Deleting its last report later removes the hidden quiz as well.)
// export const deleteQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
//   const quizId = req.params.id;
//   const existing = await prisma.quiz.findUnique({ where: { id: quizId } });

//   if (!existing || existing.deletedAt) {
//     throw new ApiError(404, "Quiz not found");
//   }
//   if (existing.hostId !== req.hostId) {
//     throw new ApiError(403, "You do not have access to this quiz");
//   }

//   // Games that never started (just an opened lobby), or that you deleted earlier, have no
//   // results worth keeping: remove them completely, together with their players and answers.
//   const unplayed = await prisma.quizSession.findMany({
//     where: { quizId, OR: [{ status: "WAITING" }, { deletedAt: { not: null } }] },
//     select: { id: true },
//   });
//   const unplayedIds = unplayed.map((s) => s.id);

//   if (unplayedIds.length > 0) {
//     await prisma.$transaction([
//       prisma.answer.deleteMany({ where: { participant: { sessionId: { in: unplayedIds } } } }),
//       prisma.participant.deleteMany({ where: { sessionId: { in: unplayedIds } } }),
//       prisma.quizSession.deleteMany({ where: { id: { in: unplayedIds } } }),
//     ]);
//   }

//   const playedGames = await prisma.quizSession.count({ where: { quizId } });

//   if (playedGames === 0) {
//     // Nothing to keep: remove the quiz completely (its questions and options go with it).
//     await prisma.quiz.delete({ where: { id: quizId } });
//   } else {
//     // It has results: hide it. Its reports keep working until you delete them.
//     await prisma.quiz.update({ where: { id: quizId }, data: { deletedAt: new Date() } });
//   }

//   res.json({ success: true, message: "Quiz deleted" });
// });

// Moves the quiz to Trash. Its finished games (reports) stay in Reports.
// Games that never started (just an opened lobby) have nothing worth keeping: removed now.
export const deleteQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quizId = req.params.id;
  const existing = await prisma.quiz.findUnique({ where: { id: quizId } });

  if (!existing || existing.deletedAt) {
    throw new ApiError(404, "Quiz not found");
  }
  if (existing.hostId !== req.hostId) {
    throw new ApiError(403, "You do not have access to this quiz");
  }

  const lobbies = await prisma.quizSession.findMany({
    where: { quizId, status: "WAITING" },
    select: { id: true },
  });
  await deleteSessionsForever(lobbies.map((s) => s.id));

  await prisma.quiz.update({ where: { id: quizId }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Moved to Trash" });
});

// Copies a quiz with all its current questions and options as a brand-new quiz.
// The copy has no past games, and editing it never touches the original.
export const duplicateQuiz = asyncHandler(async (req: AuthRequest, res: Response) => {
  const source = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!source || source.deletedAt) {
    throw new ApiError(404, "Quiz not found");
  }
  if (source.hostId !== req.hostId) {
    throw new ApiError(403, "You do not have access to this quiz");
  }

  const copy = await prisma.quiz.create({
    data: {
      hostId: source.hostId,
      title: `${source.title} (Copy)`,
      description: source.description,
      topic: source.topic,
      category: source.category,
      timePerQuestion: source.timePerQuestion,
      questions: {
        create: source.questions.map((q, index) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: index,
          options: {
            create: q.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })),
          },
        })),
      },
    },
    include: { _count: { select: { questions: true } } },
  });

  res.status(201).json({ success: true, data: copy });
});