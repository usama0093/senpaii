import prisma from "../config/prisma";
import type { CategoryType } from "@prisma/client";

export const DEFAULT_CATEGORY = "Generic";

// Trimmed and kept to a sensible length. Empty means "Generic".
export function cleanCategoryName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : DEFAULT_CATEGORY;
}

// Finds the category with this name (ignoring capitals) or creates it, within the given
// type's list only. Quiz and QOD categories are completely separate — "Science" (QUIZ)
// and "Science" (QOD) are two different rows, never shared.
// Always returns the stored spelling, so "python" and "Python" never become two categories.
export async function resolveCategory(hostId: string, value: unknown, type: CategoryType = "QUIZ"): Promise<string> {
  const name = cleanCategoryName(value);

  const existing = await prisma.category.findFirst({
    where: { hostId, type, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing.name;

  try {
    const created = await prisma.category.create({ data: { hostId, name, type } });
    return created.name;
  } catch (err) {
    // Created at the same moment by another request — use that one.
    const again = await prisma.category.findFirst({
      where: { hostId, type, name: { equals: name, mode: "insensitive" } },
    });
    return again ? again.name : name;
  }
}