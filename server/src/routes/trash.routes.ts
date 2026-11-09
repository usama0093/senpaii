import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  getTrash,
  updateTrashSettings,
  restoreQuiz,
  deleteQuizPermanently,
  emptyQuizzes,
  restoreSession,
  deleteSessionPermanently,
  emptySessions,
  restoreQodQuiz,
  deleteQodQuizPermanently,
  emptyQodQuizzes,
  restoreQodSession,
  deleteQodSessionPermanently,
  emptyQodSessions,
} from "../controllers/trash.controller";

const router = Router();

router.use(protect); // everything here needs a logged-in host

router.get("/", getTrash);
router.put("/settings", updateTrashSettings);

router.post("/quizzes/:id/restore", restoreQuiz);
router.delete("/quizzes/:id", deleteQuizPermanently);
router.post("/empty/quizzes", emptyQuizzes);

router.post("/sessions/:id/restore", restoreSession);
router.delete("/sessions/:id", deleteSessionPermanently);
router.post("/empty/sessions", emptySessions);

router.post("/qod-quizzes/:id/restore", restoreQodQuiz);
router.delete("/qod-quizzes/:id", deleteQodQuizPermanently);
router.post("/empty/qod-quizzes", emptyQodQuizzes);

router.post("/qod-sessions/:id/restore", restoreQodSession);
router.delete("/qod-sessions/:id", deleteQodSessionPermanently);
router.post("/empty/qod-sessions", emptyQodSessions);

export default router;