import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import feedbackRoutes from "./feedback.routes";
import qodLiveRoutes from "./qodLive.routes";
import trashRoutes from "./trash.routes";
import { startGameFeedback } from "../controllers/feedback.controller";
import {
  startSession,
  joinSession,
  renameParticipant,
  getSessionParticipants,
  deleteSession,
  getQuizSessions,
  getAllSessions,
  getSessionReport,
  removeParticipant,
  renameReportParticipant,
} from "../controllers/session.controller";

const router = Router();

router.post("/join", joinSession); // public
router.put("/:sessionId/participants/:participantId", renameParticipant); // public, WAITING only
router.use("/feedback", feedbackRoutes); // live feedback (some routes public, some host-only)
router.use("/qod/live", qodLiveRoutes); // live QOD (some routes public, some host-only)
router.use("/trash", trashRoutes); // Trash (host only)
router.get("/", protect, getAllSessions); // host only: all my sessions
router.post("/quizzes/:quizId/start", protect, startSession); // host only
router.get("/quizzes/:quizId", protect, getQuizSessions);
router.post("/:sessionId/feedback", protect, startGameFeedback); // feedback for a finished game
router.delete("/:sessionId", protect, deleteSession);
router.get("/:sessionId/participants", protect, getSessionParticipants); // host only
router.delete("/:sessionId/participants/:participantId", protect, removeParticipant); // host only
router.put("/:sessionId/participants/:participantId/name", protect, renameReportParticipant); // host only — report correction
router.get("/:sessionId/report", protect, getSessionReport); // host only

export default router;