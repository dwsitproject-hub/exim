"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { PERMISSION_CATALOG, USER_ROLE_OPTIONS, getRoleDefaultPermissionSet } from "@/lib/rbac-matrix";
import { getUser, patchUser } from "@/services/users-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { UserAdmin } from "@/types/users";
import { PageHeader } from "@/components/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { Input, Button } from "@/components/forms";
import { Badge } from "@/components/badges";
import styles from "../UserForm.module.css";

const MANAGE_USERS = "MANAGE_USERS";

export function UserEdit({ userId }: { userId: string }) {
  const router = useRouter();
  const { accessToken, user: authUser } = useAuth();
  const { pushToast } = useToast();
  const [row, setRow] = useState<UserAdmin | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(USER_ROLE_OPTIONS[2]!);
  const [isActive, setIsActive] = useState(true);
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const allowed = can(authUser, MANAGE_USERS);
  const roleDefaults = getRoleDefaultPermissionSet(role);
  const effectivePermissions = new Set<string>([...roleDefaults, ...overrides]);

  const load = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getUser(userId, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          setRow(null);
          return;
        }
        const u = (res as ApiSuccess<UserAdmin>).data;
        setRow(u);
        setName(u.name);
        setRole(u.role);
        setIsActive(u.is_active);
        setOverrides(new Set(u.permission_overrides ?? []));
      })
      .catch(() => setError("Failed to load user"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed, userId]);

  useEffect(() => {
    load();
  }, [load]);

  function togglePerm(key: string) {
    if (roleDefaults.has(key)) return; // cannot remove role defaults
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accessToken) return;
    setSaving(true);
    const body: Parameters<typeof patchUser>[1] = {
      name,
      role,
      is_active: isActive,
      // Store only extras not already granted by the role.
      permission_overrides: Array.from(overrides).filter((p) => !roleDefaults.has(p)),
    };
    if (password.trim().length > 0) {
      body.password = password;
    }
    const res = await patchUser(userId, body, accessToken);
    setSaving(false);
    if (isApiError(res)) {
      setError(res.message);
      pushToast(res.message, "error");
      return;
    }
    pushToast("Changes saved.", "success");
    setPassword("");
    setRow(res.data);
    setOverrides(new Set(res.data.permission_overrides ?? []));
    router.refresh();
  }

  if (!allowed) {
    return (
      <section>
        <PageHeader title="Edit user" backHref="/admin/users" backLabel="Users" />
        <p className={styles.denied}>You do not have permission to manage users.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section>
        <PageHeader title="Edit user" backHref="/admin/users" backLabel="Users" />
        <p className="utilLoadingFallback">Loading…</p>
      </section>
    );
  }

  if (!row) {
    return (
      <section>
        <PageHeader title="Edit user" backHref="/admin/users" backLabel="Users" />
        <p className={styles.error}>{error ?? "User not found"}</p>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title={row.name}
        backHref="/admin/users"
        backLabel="Users"
        subtitle={row.email}
      />

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div>
          <span className={styles.fieldLabel}>Email</span>
          <p style={{ margin: 0, fontSize: 16 }}>{row.email}</p>
        </div>
        <Input
          label="New password (optional)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={password ? 8 : undefined}
        />
        <div>
          <label htmlFor="edit-user-role" className={styles.fieldLabel}>
            Role
          </label>
          <select
            id="edit-user-role"
            className={styles.select}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            {USER_ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <label className={styles.permRow}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Account active</span>
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Permission overrides (RBAC)</legend>
          <p className={styles.effective}>
            Extra grants on top of the role. Effective access is the union of role defaults and these keys.
          </p>
          <div className={styles.permGrid}>
            {PERMISSION_CATALOG.map(({ key, label }) => (
              <label key={key} className={styles.permRow}>
                <input
                  type="checkbox"
                  checked={effectivePermissions.has(key)}
                  disabled={roleDefaults.has(key)}
                  onChange={() => togglePerm(key)}
                />
                <span>
                  <strong>{key}</strong> — {label}{" "}
                  {roleDefaults.has(key) ? <em>(from role)</em> : overrides.has(key) ? <em>(override)</em> : null}
                </span>
              </label>
            ))}
          </div>
          <div className={styles.effective}>
            Effective permissions ({effectivePermissions.size})
            <div className={styles.effectiveTags}>
              {Array.from(effectivePermissions)
                .sort()
                .map((p) => (
                <Badge key={p} variant="neutral">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        </fieldset>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </section>
  );
}
