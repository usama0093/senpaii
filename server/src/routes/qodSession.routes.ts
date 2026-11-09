import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  startQodSession,
  getQodSession,
  getAllQodSessions,
  nextQodQuestion,
  endQodSession,
  submitQodResponse,
  updateQodResponse,
  deleteQodResponse,
  getQodSessionReport,
  trashQodSessionReport,
  renameQodParticipant,
  getQodSessionPublicStatus,
  getMyQodResponses,
  removeQodParticipant,
  renameQodReportParticipant,
} from "../controllers/qodSession.controller";

const router = Router();

router.post("/:sessionId/responses", submitQodResponse); // public
router.get("/:sessionId/responses", getMyQodResponses); // public — a student's own responses only
router.put("/:sessionId/responses/:responseId", updateQodResponse); // public
router.put("/:sessionId/participants/:participantId", renameQodParticipant); // public
router.get("/:sessionId/status", getQodSessionPublicStatus); // public
router.post("/", protect, startQodSession);
router.get("/", protect, getAllQodSessions);
router.get("/:sessionId", protect, getQodSession);
router.get("/:sessionId/report", protect, getQodSessionReport);
router.put("/:sessionId/next", protect, nextQodQuestion);
router.delete("/:sessionId/responses/:responseId", protect, deleteQodResponse);
router.delete("/:sessionId/participants/:participantId", protect, removeQodParticipant);
router.put("/:sessionId/participants/:participantId/name", protect, renameQodReportParticipant); // host only — report correction
router.delete("/:sessionId/report", protect, trashQodSessionReport);
router.delete("/:sessionId", protect, endQodSession);

export default router;