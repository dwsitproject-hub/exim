"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { PERMISSION_CATALOG, USER_ROLE_OPTIONS, getRoleDefaultPermissionSet } from "@/lib/rbac-matrix";
import { createUser } from "@/services/users-service";
import { isApiError } from "@/types/api";
import { PageHeader } from "@/components/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { Input, Button } from "@/components/forms";
import { Badge } from "@/components/badges";
import styles from "../UserForm.module.css";

const MANAGE_USERS = "MANAGE_USERS";

export function UserNew() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(USER_ROLE_OPTIONS[2]!);
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allowed = can(user, MANAGE_USERS);
  const roleDefaults = getRoleDefaultPermissionSet(role);
  const effectivePermissions = new Set<string>([...roleDefaults, ...overrides]);

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
    setLoading(true);
    const res = await createUser(
      {
        name,
        email,
        password,
        role,
        // Store only extras not already granted by the role.
        permission_overrides: Array.from(overrides).filter((p) => !roleDefaults.has(p)),
      },
      accessToken
    );
    setLoading(false);
    if (isApiError(res)) {
      setError(res.message);
      pushToast(res.message, "error");
      return;
    }
    pushToast("User created.", "success");
    router.push(`/admin/users/${res.data.id}`);
  }

  if (!allowed) {
    return (
      <section>
        <PageHeader title="New user" backHref="/admin/users" backLabel="Users" />
        <p className={styles.denied}>You do not have permission to manage users.</p>
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="New user" backHref="/admin/users" backLabel="Users" />

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label="Temporary password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
        <div>
          <label htmlFor="user-role" className={styles.fieldLabel}>
            Role
          </label>
          <select
            id="user-role"
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

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Extra permissions (RBAC)</legend>
          <p className={styles.effective}>
            Pick a role to see default access. You can add extra permission overrides on top.
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

        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create user"}
        </Button>
      </form>
    </section>
  );
}
