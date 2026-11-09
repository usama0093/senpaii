import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  startLiveQod,
  getActiveLiveQod,
  getLiveQod,
  continueLiveQod,
  setQodQuestion,
  endLiveQod,
  joinLiveQod,
  submitLiveQodAnswer,
  renameLiveQodParticipant,
  deleteLiveQodAnswer,
} from "../controllers/liveQod.controller";

const router = Router();

router.post("/join", joinLiveQod); // public
router.post("/:pin/answers", submitLiveQodAnswer); // public
router.put("/:pin/participants/:token", renameLiveQodParticipant); // public
router.post("/", protect, startLiveQod);
router.get("/active", protect, getActiveLiveQod);
router.get("/:pin", protect, getLiveQod);
router.put("/:pin/continue", protect, continueLiveQod);
router.put("/:pin/question", protect, setQodQuestion);
router.delete("/:pin/answers/:answerId", protect, deleteLiveQodAnswer);
router.delete("/:pin", protect, endLiveQod);

export default router;