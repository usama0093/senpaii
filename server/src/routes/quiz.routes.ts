import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  createQuiz,
  getQuizzes,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  duplicateQuiz,
} from "../controllers/quiz.controller";
import {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  duplicateQuestion,
  bulkUpdateQuestions,
} from "../controllers/question.controller";
import { getCategories, createCategory, deleteCategory } from "../controllers/category.controller";

const router = Router();

router.use(protect); // every route below requires a logged-in host

router.post("/", createQuiz);
router.get("/", getQuizzes);

// Fixed words ("categories") MUST come before the /:id routes.
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.delete("/categories/:categoryId", deleteCategory);

router.get("/:id", getQuizById);
router.put("/:id", updateQuiz);
router.delete("/:id", deleteQuiz);
router.post("/:id/duplicate", duplicateQuiz);

router.post("/:quizId/questions", addQuestion);
// Fixed words ("reorder", "bulk") MUST come before the /:questionId routes.
router.put("/:quizId/questions/reorder", reorderQuestions);
router.put("/:quizId/questions/bulk", bulkUpdateQuestions);
router.post("/:quizId/questions/:questionId/duplicate", duplicateQuestion);
router.put("/:quizId/questions/:questionId", updateQuestion);
router.delete("/:quizId/questions/:questionId", deleteQuestion);

export default router;