import { Router } from "express";
import { register, login, getMe, updateProfile, changePassword, deleteAccount } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/me", protect, updateProfile);
router.put("/me/password", protect, changePassword);
router.delete("/me", protect, deleteAccount);

export default router;