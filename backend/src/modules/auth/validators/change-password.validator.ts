/**
 * Authenticated password change: current_password, new_password, password_confirmation.
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";

const MIN_PASSWORD_LENGTH = 8;

export interface ChangePasswordInput {
  current_password?: string;
  new_password: string;
}

export function validateChangePasswordBody(
  req: Request,
  options?: { requireCurrentPassword?: boolean }
): { ok: true; data: ChangePasswordInput } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];
  const requireCurrentPassword = options?.requireCurrentPassword !== false;

  const currentPassword = typeof body?.current_password === "string" ? body.current_password : "";
  if (requireCurrentPassword && !currentPassword) {
    errors.push({ field: "current_password", message: "Current password is required" });
  }

  const newPassword = typeof body?.new_password === "string" ? body.new_password : "";
  if (!newPassword) {
    errors.push({ field: "new_password", message: "New password is required" });
  } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: "new_password",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  } else if (currentPassword && newPassword === currentPassword) {
    errors.push({ field: "new_password", message: "New password must be different from current password" });
  }

  const passwordConfirmation =
    typeof body?.password_confirmation === "string" ? body.password_confirmation : "";
  if (!passwordConfirmation) {
    errors.push({ field: "password_confirmation", message: "Confirmation password is required" });
  } else if (newPassword !== passwordConfirmation) {
    errors.push({ field: "password_confirmation", message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      ...(currentPassword ? { current_password: currentPassword } : {}),
      new_password: newPassword,
    },
  };
}
