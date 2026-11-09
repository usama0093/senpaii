import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  startLiveFeedback,
  getActiveLiveFeedback,
  getLiveFeedback,
  endLiveFeedback,
  joinLiveFeedback,
  sendLiveFeedback,
  deleteLiveFeedbackMessage,
  renameLiveFeedbackParticipant,
} from "../controllers/feedback.controller";

const router = Router();

// Students (public)
router.post("/live/join", joinLiveFeedback);
router.post("/live/:pin/messages", sendLiveFeedback);
router.put("/live/:pin/participants/:token", renameLiveFeedbackParticipant);

// Host (login required)
router.post("/live", protect, startLiveFeedback);
router.get("/live/active", protect, getActiveLiveFeedback); // must be before /live/:pin
router.get("/live/:pin", protect, getLiveFeedback);
router.delete("/live/:pin/messages/:messageId", protect, deleteLiveFeedbackMessage);
router.delete("/live/:pin", protect, endLiveFeedback);

export default router;