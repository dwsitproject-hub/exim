/**
 * Admin user management: CRUD and CSV import.
 */

import { AppError } from "../../../middlewares/errorHandler.js";
import {
  computeEffectivePermissions,
  normalizePermissionOverrides,
  VALID_ROLES,
  ALL_PERMISSION_KEYS,
} from "../../../shared/rbac.js";
import type { UserRow } from "../../auth/dto/index.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { AuthService } from "../../auth/services/auth.service.js";
import type { UserAdminDto, UserImportResultDto, UserImportResultRow } from "../dto/index.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

function assertValidRole(role: string): void {
  const r = role.trim().toUpperCase();
  if (!VALID_ROLES.includes(r)) {
    throw new AppError(`Invalid role. Allowed: ${VALID_ROLES.join(", ")}`, 400);
  }
}

function rowToDto(row: UserRow): UserAdminDto {
  const permission_overrides = normalizePermissionOverrides(row.permission_overrides);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    is_active: row.is_active,
    email_verified_at: row.email_verified_at ? row.email_verified_at.toISOString() : null,
    permission_overrides,
    effective_permissions: [...computeEffectivePermissions(row.role, permission_overrides)],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class UserAdminService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthService
  ) {}

  async list(params: { search?: string; page?: number; limit?: number }): Promise<{
    items: UserAdminDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIST_LIMIT));
    const offset = (page - 1) * limit;
    const search = params.search?.trim();
    const [items, total] = await Promise.all([
      this.userRepo.listForAdmin({ search, limit, offset }),
      this.userRepo.countForAdmin(search),
    ]);
    return {
      items: items.map(rowToDto),
      meta: { page, limit, total },
    };
  }

  async getById(id: string): Promise<UserAdminDto | null> {
    const row = await this.userRepo.findByIdAny(id);
    return row ? rowToDto(row) : null;
  }

  async create(input: {
    name: string;
    email: string;
    password: string;
    role: string;
    permission_overrides?: string[];
  }): Promise<UserAdminDto> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) throw new AppError("Name is required", 400);
    if (!EMAIL_RE.test(email)) throw new AppError("Invalid email", 400);
    if (input.password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
    assertValidRole(input.role);
    const permission_overrides = normalizePermissionOverrides(input.permission_overrides ?? []);
    const dup = await this.userRepo.findByEmailAny(email);
    if (dup) throw new AppError("An account with this email already exists", 409);
    const passwordHash = await this.authService.hashPassword(input.password);
    const row = await this.userRepo.create({
      email,
      passwordHash,
      name,
      role: input.role.trim().toUpperCase(),
      emailVerified: true,
      mustChangePassword: true,
      permissionOverrides: permission_overrides,
    });
    return rowToDto(row);
  }

  async update(
    targetId: string,
    actorId: string,
    input: {
      name?: string;
      role?: string;
      is_active?: boolean;
      permission_overrides?: string[];
      password?: string;
    }
  ): Promise<UserAdminDto | null> {
    if (targetId === actorId) {
      if (input.is_active === false) {
        throw new AppError("You cannot deactivate your own account", 400);
      }
      if (input.role !== undefined && input.role.trim().toUpperCase() !== "ADMIN") {
        throw new AppError("You cannot change your own role away from ADMIN", 400);
      }
    }

    const existing = await this.userRepo.findByIdAny(targetId);
    if (!existing) return null;

    if (input.role !== undefined) assertValidRole(input.role);

    let password_hash: string | undefined;
    if (input.password !== undefined) {
      if (input.password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
      password_hash = await this.authService.hashPassword(input.password);
    }

    const patch: Parameters<UserRepository["updateAdmin"]>[1] = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.role !== undefined) patch.role = input.role.trim().toUpperCase();
    if (input.is_active !== undefined) patch.is_active = input.is_active;
    if (input.permission_overrides !== undefined) {
      patch.permission_overrides = normalizePermissionOverrides(input.permission_overrides);
    }
    if (password_hash !== undefined) patch.password_hash = password_hash;

    const row = await this.userRepo.updateAdmin(targetId, patch);
    return row ? rowToDto(row) : null;
  }

  /** Parse CSV with header: name,email,password,role[,permissions]. Permissions: pipe-separated permission keys. */
  async importFromCsv(csvText: string): Promise<UserImportResultDto> {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      throw new AppError("CSV must include a header row and at least one data row", 400);
    }
    const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const idx = (key: string) => header.indexOf(key);
    const iName = idx("name");
    const iEmail = idx("email");
    const iPass = idx("password");
    const iRole = idx("role");
    const iPerm = idx("permissions");
    if (iName < 0 || iEmail < 0 || iPass < 0 || iRole < 0) {
      throw new AppError("CSV header must include columns: name, email, password, role", 400);
    }

    const errors: UserImportResultRow[] = [];
    let created = 0;
    const permSet = new Set(ALL_PERMISSION_KEYS);

    for (let r = 1; r < lines.length; r++) {
      const rowNum = r + 1;
      const cells = parseCsvLine(lines[r]!);
      const name = (cells[iName] ?? "").trim();
      const email = (cells[iEmail] ?? "").trim().toLowerCase();
      const password = cells[iPass] ?? "";
      const role = (cells[iRole] ?? "").trim();
      const permRaw = iPerm >= 0 ? (cells[iPerm] ?? "").trim() : "";
      const permissionList = permRaw
        ? permRaw
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      const badPerm = permissionList.find((p) => !permSet.has(p));
      if (badPerm) {
        errors.push({ row: rowNum, email, message: `Unknown permission: ${badPerm}` });
        continue;
      }
      try {
        if (!name) throw new AppError("Name is required", 400);
        if (!EMAIL_RE.test(email)) throw new AppError("Invalid email", 400);
        if (password.length < 8) throw new AppError("Password too short", 400);
        assertValidRole(role);
        const dup = await this.userRepo.findByEmailAny(email);
        if (dup) throw new AppError("Email already exists", 409);
        const passwordHash = await this.authService.hashPassword(password);
        await this.userRepo.create({
          email,
          passwordHash,
          name,
          role: role.toUpperCase(),
          emailVerified: true,
          mustChangePassword: true,
          permissionOverrides: permissionList,
        });
        created++;
      } catch (e) {
        const message = e instanceof AppError ? e.message : "Failed to create user";
        errors.push({ row: rowNum, email, message });
      }
    }

    return { created, errors };
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && c === ",") {
      result.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}
