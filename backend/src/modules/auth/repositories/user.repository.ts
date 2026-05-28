/**
 * User repository: database access only. No business logic.
 * Table: users (id, email, password_hash, name, role, is_active, email_verified_at, permission_overrides, …).
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type { UserRow } from "../dto/index.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  /** When true, user can sign in immediately (admin-provisioned). */
  emailVerified?: boolean;
  permissionOverrides?: string[];
}

export interface ListUsersParams {
  search?: string;
  limit: number;
  offset: number;
}

export interface UpdateUserAdminInput {
  name?: string;
  role?: string;
  is_active?: boolean;
  permission_overrides?: string[];
  password_hash?: string;
}

export class UserRepository {
  private get pool(): Pool {
    return getPool();
  }

  private mapRow(r: UserRow): UserRow {
    return {
      ...r,
      permission_overrides: Array.isArray(r.permission_overrides) ? r.permission_overrides : [],
    };
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, name, role, is_active, email_verified_at,
              COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at
       FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true LIMIT 1`,
      [email]
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, name, role, is_active, email_verified_at,
              COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at
       FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  /** Any status — for admin duplicate check. */
  async findByEmailAny(email: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, name, role, is_active, email_verified_at,
              COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  /** Includes inactive — for admin detail/update. */
  async findByIdAny(id: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, name, role, is_active, email_verified_at,
              COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const emailVerifiedAt = input.emailVerified === true ? new Date() : null;
    const overrides = input.permissionOverrides ?? [];
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, email_verified_at, permission_overrides, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, $6::text[], NOW(), NOW())
       RETURNING id, email, password_hash, name, role, is_active, email_verified_at,
                 COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at`,
      [input.email, input.passwordHash, input.name, input.role, emailVerifiedAt, overrides]
    );
    if (!result.rows[0]) {
      throw new Error("UserRepository.create: no row returned");
    }
    return this.mapRow(result.rows[0]);
  }

  async setEmailVerified(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, userId]
    );
  }

  async listForAdmin(params: ListUsersParams): Promise<UserRow[]> {
    const search = params.search?.trim();
    const hasSearch = Boolean(search);
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, name, role, is_active, email_verified_at,
              COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at
       FROM users
       WHERE NOT ($1::boolean) OR LOWER(name) LIKE '%' || LOWER($2) || '%' OR LOWER(email) LIKE '%' || LOWER($2) || '%'
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [hasSearch, hasSearch ? search : "", params.limit, params.offset]
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async countForAdmin(search?: string): Promise<number> {
    const s = search?.trim();
    const hasSearch = Boolean(s);
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users
       WHERE NOT ($1::boolean) OR LOWER(name) LIKE '%' || LOWER($2) || '%' OR LOWER(email) LIKE '%' || LOWER($2) || '%'`,
      [hasSearch, hasSearch ? s : ""]
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async updateAdmin(userId: string, input: UpdateUserAdminInput): Promise<UserRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(input.name.trim());
    }
    if (input.role !== undefined) {
      sets.push(`role = $${i++}`);
      values.push(input.role.trim().toUpperCase());
    }
    if (input.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(input.is_active);
    }
    if (input.permission_overrides !== undefined) {
      sets.push(`permission_overrides = $${i++}::text[]`);
      values.push(input.permission_overrides);
    }
    if (input.password_hash !== undefined) {
      sets.push(`password_hash = $${i++}`);
      values.push(input.password_hash);
    }

    if (!sets.length) {
      return this.findByIdAny(userId);
    }

    sets.push("updated_at = NOW()");
    values.push(userId);

    const result = await this.pool.query<UserRow>(
      `UPDATE users SET ${sets.join(", ")}
       WHERE id = $${i}
       RETURNING id, email, password_hash, name, role, is_active, email_verified_at,
                 COALESCE(permission_overrides, '{}') AS permission_overrides, created_at, updated_at`,
      values
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  /** Active users for @mention autocomplete (VIEW_SHIPMENTS — not admin list). */
  async listActiveForMentionSearch(
    search: string | undefined,
    limit: number
  ): Promise<{ id: string; name: string; email: string }[]> {
    const lim = Math.min(Math.max(1, limit), 50);
    const s = search?.trim();
    const hasSearch = Boolean(s);
    const result = await this.pool.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM users
       WHERE is_active = true
         AND (NOT $1::boolean OR LOWER(name) LIKE '%' || LOWER($2) || '%' OR LOWER(email) LIKE '%' || LOWER($2) || '%')
       ORDER BY name ASC NULLS LAST, email ASC
       LIMIT $3`,
      [hasSearch, hasSearch ? s : "", lim]
    );
    return result.rows;
  }

  /** Which of the given IDs refer to active users (for validating parsed @mentions). */
  async filterExistingActiveUserIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [ids]
    );
    return new Set(result.rows.map((r) => r.id));
  }
}
