/**
 * Auth routes: login, refresh, logout, me, verify-email, forgot-password, reset-password, OIDC SSO.
 */

import { Router } from "express";
import { login, refresh, logout, getMe, verifyEmail, forgotPassword, resetPassword, changePassword } from "./controllers/auth.controller.js";
import { oidcCallback, oidcLogin, oidcStatus } from "./controllers/oidc.controller.js";
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
authRoutes.post("/change-password", authMiddleware, changePassword);

authRoutes.post("/verify-email", authTokenFlowLimiter, verifyEmail);
authRoutes.get("/verify-email", authTokenFlowLimiter, verifyEmail);
authRoutes.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
authRoutes.post("/reset-password", authTokenFlowLimiter, resetPassword);

authRoutes.get("/oidc/status", oidcStatus);
authRoutes.get("/oidc/login", loginLimiter, oidcLogin);
authRoutes.get("/oidc/callback", loginLimiter, oidcCallback);
