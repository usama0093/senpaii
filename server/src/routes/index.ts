import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import quizRoutes from "./quiz.routes";
import qodQuizRoutes from "./qodQuiz.routes";
import qodSessionRoutes from "./qodSession.routes";
import sessionRoutes from "./session.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/quizzes", quizRoutes);
router.use("/qod-quizzes", qodQuizRoutes);
router.use("/qod-sessions", qodSessionRoutes);
router.use("/sessions", sessionRoutes);

export default router;