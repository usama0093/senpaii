import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  createQodQuiz,
  getQodQuizzes,
  getQodQuizById,
  updateQodQuiz,
  deleteQodQuiz,
  duplicateQodQuiz,
} from "../controllers/qodQuiz.controller";
import {
  addQodQuestion,
  updateQodQuestion,
  deleteQodQuestion,
  reorderQodQuestions,
  duplicateQodQuestion,
} from "../controllers/qodQuestion.controller";
import { getCategories, createCategory, deleteCategory } from "../controllers/category.controller";

const router = Router();

router.use(protect); // every route below requires a logged-in host

router.post("/", createQodQuiz);
router.get("/", getQodQuizzes);

// Fixed word ("categories") MUST come before the /:id routes. These force the QOD
// category list — the frontend never needs to pass type=qod itself.
router.get("/categories", (req, _res, next) => {
  req.query.type = "qod";
  next();
}, getCategories);
router.post("/categories", (req, _res, next) => {
  req.body.type = "qod";
  next();
}, createCategory);
router.delete("/categories/:categoryId", deleteCategory);

router.get("/:id", getQodQuizById);
router.put("/:id", updateQodQuiz);
router.delete("/:id", deleteQodQuiz);
router.post("/:id/duplicate", duplicateQodQuiz);

router.post("/:qodQuizId/questions", addQodQuestion);
// Fixed word ("reorder") MUST come before the /:questionId routes.
router.put("/:qodQuizId/questions/reorder", reorderQodQuestions);
router.post("/:qodQuizId/questions/:questionId/duplicate", duplicateQodQuestion);
router.put("/:qodQuizId/questions/:questionId", updateQodQuestion);
router.delete("/:qodQuizId/questions/:questionId", deleteQodQuestion);

export default router;