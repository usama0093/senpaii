import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { generateToken } from "../utils/jwt";
import { AuthRequest } from "../middleware/auth.middleware";
import { purgeExpiredHosts } from "../utils/hostCleanup";

const SALT_ROUNDS = 10;

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, confirmPassword } = req.body;

  if (!name || !email || !password || !confirmPassword) {
    throw new ApiError(400, "All fields are required");
  }
  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }
  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  // Frees up any email whose account was scheduled for deletion and has now
  // passed its 30-day grace period, before checking for a collision below.
  await purgeExpiredHosts();

  const existingHost = await prisma.host.findUnique({ where: { email } });
  if (existingHost) {
    throw new ApiError(400, "Email is already registered");
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const host = await prisma.host.create({
    data: { name, email, password: hashedPassword },
  });

  const token = generateToken({ hostId: host.id });

  res.status(201).json({
    success: true,
    message: "Registered successfully",
    data: {
      token,
      host: { id: host.id, name: host.name, email: host.email, phone: host.phone },
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  await purgeExpiredHosts();

  const host = await prisma.host.findUnique({ where: { email } });
  if (!host) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await bcrypt.compare(password, host.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  // A correct login during the 30-day grace period cancels the scheduled deletion
  // and signs them in normally — no separate "restore" step.
  const accountRestored = host.deletedAt !== null;
  if (accountRestored) {
    await prisma.host.update({ where: { id: host.id }, data: { deletedAt: null } });
  }

  const token = generateToken({ hostId: host.id });

  res.json({
    success: true,
    message: "Logged in successfully",
    data: {
      token,
      host: { id: host.id, name: host.name, email: host.email, phone: host.phone },
      accountRestored,
    },
  });
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const host = await prisma.host.findUnique({
    where: { id: req.hostId },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });

  if (!host) {
    throw new ApiError(404, "Host not found");
  }

  res.json({ success: true, data: host });
});

// ---------- Profile (name / email / phone) ----------
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, email, phone } = req.body;

  if (!name || !name.trim()) throw new ApiError(400, "Name is required");
  if (!email || !email.trim()) throw new ApiError(400, "Email is required");

  const trimmedEmail = email.trim();

  const existing = await prisma.host.findUnique({ where: { email: trimmedEmail } });
  if (existing && existing.id !== req.hostId) {
    throw new ApiError(400, "That email is already registered to another account");
  }

  const updated = await prisma.host.update({
    where: { id: req.hostId },
    data: {
      name: name.trim(),
      email: trimmedEmail,
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    },
  });

  res.json({
    success: true,
    message: "Profile updated",
    data: { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone },
  });
});

// ---------- Change password ----------
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new ApiError(400, "Fill in all three password fields");
  }
  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "The new passwords don't match");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  const host = await prisma.host.findUnique({ where: { id: req.hostId } });
  if (!host) throw new ApiError(404, "Host not found");

  const isMatch = await bcrypt.compare(currentPassword, host.password);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.host.update({ where: { id: host.id }, data: { password: hashedPassword } });

  res.json({ success: true, message: "Password changed" });
});

// ---------- Delete account (soft — 30-day recoverable window) ----------
// Does NOT delete any data here. It only marks the account; the real, permanent,
// cascading delete happens later via purgeExpiredHosts(), once 30 days have passed
// with no login. Requires the current password as an extra check, on top of the
// confirmation modal already shown client-side.
export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { password } = req.body;
  if (!password) throw new ApiError(400, "Enter your password to confirm");

  const host = await prisma.host.findUnique({ where: { id: req.hostId } });
  if (!host) throw new ApiError(404, "Host not found");

  const isMatch = await bcrypt.compare(password, host.password);
  if (!isMatch) throw new ApiError(401, "Incorrect password");

  await prisma.host.update({ where: { id: host.id }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Account scheduled for deletion" });
});