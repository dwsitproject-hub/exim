/**
 * Auth routes: login, refresh, logout, me, verify-email, forgot-password, reset-password.
 */

import { Router } from "express";
import { login, refresh, logout, getMe, verifyEmail, forgotPassword, resetPassword } from "./controllers/auth.controller.js";
import { authMiddleware } from "./auth.middleware.js";
import {
  loginLimiter,
  refreshAndLogoutLimiter,
  authTokenFlowLimiter,
  forgotPasswordLimiter,
} from "../../middlewares/auth-rate-limit.js";

export const authRoutes = Router();

authRoutes.post("/login", loginLimiter, login);
authRoutes.post("/refresh", refreshAndLogoutLimiter, refresh);
authRoutes.post("/logout", refreshAndLogoutLimiter, logout);
authRoutes.get("/me", authMiddleware, getMe);

authRoutes.post("/verify-email", authTokenFlowLimiter, verifyEmail);
authRoutes.get("/verify-email", authTokenFlowLimiter, verifyEmail);
authRoutes.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
authRoutes.post("/reset-password", authTokenFlowLimiter, resetPassword);
