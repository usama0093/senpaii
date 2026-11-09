import { Response } from "express";
import type { CategoryType } from "@prisma/client";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middleware/auth.middleware";
import { DEFAULT_CATEGORY, resolveCategory } from "../utils/categories";

const isDefault = (name: string) => name.toLowerCase() === DEFAULT_CATEGORY.toLowerCase();

// "qod" in the query/body means the QOD category list; anything else means the regular
// Quiz Session list. The two lists are completely independent.
const typeFrom = (value: unknown): CategoryType => (value === "qod" ? "QOD" : "QUIZ");

// Every category of this type, with how many quizzes of that same type use it
// (Generic first, then A–Z).
export const getCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const hostId = req.hostId!;
  const type = typeFrom(req.query.type);

  await resolveCategory(hostId, DEFAULT_CATEGORY, type);

  // Make sure every category your quizzes of this type already use is in the list
  // (covers quizzes made before categories had their own list, or before the split).
  const used =
    type === "QOD"
      ? await prisma.qodQuiz.groupBy({ by: ["category"], where: { hostId, deletedAt: null }, _count: { _all: true } })
      : await prisma.quiz.groupBy({ by: ["category"], where: { hostId, deletedAt: null }, _count: { _all: true } });

  const counts = new Map<string, number>();
  for (const u of used) {
    const canonical = await resolveCategory(hostId, u.category, type);
    if (canonical !== u.category) {
      if (type === "QOD") {
        await prisma.qodQuiz.updateMany({ where: { hostId, category: u.category }, data: { category: canonical } });
      } else {
        await prisma.quiz.updateMany({ where: { hostId, category: u.category }, data: { category: canonical } });
      }
    }
    const key = canonical.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + u._count._all);
  }

  const rows = await prisma.category.findMany({ where: { hostId, type } });
  const list = rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      quizCount: counts.get(c.name.toLowerCase()) ?? 0,
      isDefault: isDefault(c.name),
    }))
    .sort((a, b) => (a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1));

  res.json({ success: true, data: list });
});

// Adds a category of this type (or returns the existing one with the same name and type).
export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const hostId = req.hostId!;
  const raw = req.body.name;
  const type = typeFrom(req.body.type);

  if (typeof raw !== "string" || !raw.trim()) {
    throw new ApiError(400, "Category name is required");
  }

  const name = await resolveCategory(hostId, raw, type);
  const row = await prisma.category.findFirst({ where: { hostId, type, name } });
  if (!row) throw new ApiError(500, "Could not create the category");

  const quizCount =
    type === "QOD"
      ? await prisma.qodQuiz.count({ where: { hostId, deletedAt: null, category: { equals: row.name, mode: "insensitive" } } })
      : await prisma.quiz.count({ where: { hostId, deletedAt: null, category: { equals: row.name, mode: "insensitive" } } });

  res.status(201).json({
    success: true,
    data: { id: row.id, name: row.name, quizCount, isDefault: isDefault(row.name) },
  });
});

// Deletes a category — only if no quiz of ITS OWN type uses it, and never Generic.
export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const hostId = req.hostId!;

  const category = await prisma.category.findUnique({ where: { id: req.params.categoryId } });
  if (!category || category.hostId !== hostId) throw new ApiError(404, "Category not found");

  if (isDefault(category.name)) {
    throw new ApiError(400, "The Generic category can't be deleted");
  }

  const inUse =
    category.type === "QOD"
      ? await prisma.qodQuiz.count({ where: { hostId, deletedAt: null, category: { equals: category.name, mode: "insensitive" } } })
      : await prisma.quiz.count({ where: { hostId, deletedAt: null, category: { equals: category.name, mode: "insensitive" } } });

  if (inUse > 0) {
    throw new ApiError(400, `This category is still used by ${inUse} quiz${inUse !== 1 ? "zes" : ""}`);
  }

  await prisma.category.delete({ where: { id: category.id } });

  res.json({ success: true, message: "Category deleted" });
});