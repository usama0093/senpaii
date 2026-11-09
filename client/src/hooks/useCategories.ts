import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";

export interface CategoryItem {
  id: string;
  name: string;
  quizCount: number;
  isDefault: boolean;
}

// Generic first, then A–Z
const sortCategories = (list: CategoryItem[]) =>
  [...list].sort((a, b) =>
    a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1
  );

// base: "/quizzes" (default, the regular Quiz Session category list) or "/qod-quizzes"
// (the QOD category list). The two lists are completely independent — a category made
// in one never appears in the other.
export function useCategories(base: string = "/quizzes") {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get(`${base}/categories`);
      setCategories(sortCategories(res.data.data));
    } catch (err) {
      console.error("Could not load categories:", err);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Creates a category (or returns the existing one with the same name).
  const addCategory = async (name: string): Promise<CategoryItem> => {
    const res = await api.post(`${base}/categories`, { name });
    const created: CategoryItem = res.data.data;
    setCategories((prev) => sortCategories(prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
    return created;
  };

  const removeCategory = async (id: string): Promise<void> => {
    await api.delete(`${base}/categories/${id}`);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  return { categories, loading, refresh, addCategory, removeCategory };
}