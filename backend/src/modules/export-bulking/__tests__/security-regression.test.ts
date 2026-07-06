/**
 * Export Bulking — security/regression checklist tests.
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/security-regression.test.ts
 *
 * API integration tests require backend at http://localhost:3003 with latest code deployed.
 * Set SKIP_API=1 to run unit-only sections (safe for CI without a running server).
 *
 * WARNING: Live IDOR DELETE tests run only after a preflight confirms the patched backend
 * (ADMIN assignment succeeds). On an unpatched backend, cross-shipment DELETE can destroy data.
 */

import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  userHasPermission,
  PERMISSIONS,
  ROLES,
  ALL_PERMISSION_KEYS,
} from "../../../shared/rbac.js";
import { STATUS_TRANSITIONS, EXPORT_BULKING_STATUSES } from "../dto/index.js";
import type { ExportBulkingStatus } from "../dto/index.js";
import { ExportBulkingDocumentService } from "../services/export-bulking-document.service.js";
import type { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import type { ExportBulkingDocumentRepository } from "../repositories/export-bulking-document.repository.js";

const API_BASE = process.env.API_BASE ?? "http://localhost:3003/api/v1";
const EB = `${API_BASE}/export/bulking`;
const SKIP_API = process.env.SKIP_API === "1";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  assert(actual === expected, `${label} (expected ${String(expected)}, got ${String(actual)})`);
}

/* ───────── Document failure modes (mocked) ───────── */

async function testDocumentUploadInsertFailure() {
  console.log("\n=== Document upload: insert throws after upload ===");

  const uploadedKeys: string[] = [];
  const deletedKeys: string[] = [];

  const mockStorage = {
    uploadFromPath: async (_path: string, _opts: unknown) => {
      const storageKey = "mock/export-bulking/orphan-test.pdf";
      uploadedKeys.push(storageKey);
      return { storageKey };
    },
    download: async () => null,
    delete: async (key: string) => {
      deletedKeys.push(key);
    },
  };

  const mockShipmentRepo = {
    getById: async () => ({
      id: "ship-1",
      shipment_no: "EXB-202601-001",
      created_at: new Date().toISOString(),
      eta: null,
    }),
  } as unknown as ExportBulkingRepository;

  const mockDocRepo = {
    insert: async () => {
      throw new Error("simulated DB insert failure");
    },
  } as unknown as ExportBulkingDocumentRepository;

  const svc = new ExportBulkingDocumentService(mockShipmentRepo, mockDocRepo);
  (svc as unknown as { storage: typeof mockStorage }).storage = mockStorage;

  const dir = await mkdtemp(join(tmpdir(), "eb-doc-test-"));
  const tempFile = join(dir, "test.pdf");
  await writeFile(tempFile, "%PDF-1.4 test");

  let threw = false;
  try {
    await svc.upload("ship-1", "bl", tempFile, "test.pdf", "application/pdf", "user-1");
  } catch {
    threw = true;
  }

  assert(threw, "upload propagates insert failure");
  assert(uploadedKeys.length === 1, "storage upload was attempted");

  const cleanedUp = deletedKeys.includes(uploadedKeys[0] ?? "");
  assert(cleanedUp, "storage key cleaned up after insert failure (no orphan)");

  await unlink(tempFile).catch(() => undefined);
}

async function testDocumentDeleteDbFirstOnFailure() {
  console.log("\n=== Document delete: DB first — storage kept when deleteById throws ===");

  const storageKey = "mock/export-bulking/keep-row.pdf";
  let storageExists = true;
  const row = {
    id: "doc-1",
    shipment_id: "ship-1",
    document_type: "bl",
    original_file_name: "keep.pdf",
    storage_key: storageKey,
    mime_type: "application/pdf",
    size_bytes: "100",
    uploaded_by: "user-1",
    uploaded_at: new Date(),
  };

  const mockStorage = {
    uploadFromPath: async () => ({ storageKey }),
    download: async () =>
      storageExists ? { stream: null, mimeType: "application/pdf" } : null,
    delete: async (_key: string) => {
      storageExists = false;
    },
  };

  const mockShipmentRepo = {
    getById: async () => ({
      id: "ship-1",
      shipment_no: "EXB-202601-001",
      created_at: new Date().toISOString(),
      eta: null,
    }),
  } as unknown as ExportBulkingRepository;

  const mockDocRepo = {
    findByIdAndShipment: async () => row,
    deleteById: async () => {
      throw new Error("simulated DB delete failure");
    },
  } as unknown as ExportBulkingDocumentRepository;

  const svc = new ExportBulkingDocumentService(mockShipmentRepo, mockDocRepo);
  (svc as unknown as { storage: typeof mockStorage }).storage = mockStorage;

  let removeThrew = false;
  try {
    await svc.remove("ship-1", "doc-1");
  } catch {
    removeThrew = true;
  }

  assert(removeThrew, "remove propagates DB delete failure");
  assert(storageExists, "storage file NOT deleted when DB delete fails (DB-first ordering)");
}

async function testDocumentDeleteSuccessDbFirst() {
  console.log("\n=== Document delete: DB first — storage removed after successful deleteById ===");

  const storageKey = "mock/export-bulking/gone.pdf";
  let storageExists = true;
  let rowDeleted = false;
  const row = {
    id: "doc-2",
    shipment_id: "ship-1",
    document_type: "bl",
    original_file_name: "gone.pdf",
    storage_key: storageKey,
    mime_type: "application/pdf",
    size_bytes: "100",
    uploaded_by: "user-1",
    uploaded_at: new Date(),
  };

  const mockStorage = {
    uploadFromPath: async () => ({ storageKey }),
    download: async () => null,
    delete: async (_key: string) => {
      storageExists = false;
    },
  };

  const mockShipmentRepo = {
    getById: async () => ({
      id: "ship-1",
      shipment_no: "EXB-202601-001",
      created_at: new Date().toISOString(),
      eta: null,
    }),
  } as unknown as ExportBulkingRepository;

  const mockDocRepo = {
    findByIdAndShipment: async () => (rowDeleted ? null : row),
    deleteById: async () => {
      rowDeleted = true;
      return true;
    },
  } as unknown as ExportBulkingDocumentRepository;

  const svc = new ExportBulkingDocumentService(mockShipmentRepo, mockDocRepo);
  (svc as unknown as { storage: typeof mockStorage }).storage = mockStorage;

  await svc.remove("ship-1", "doc-2");

  assert(rowDeleted, "DB row deleted first");
  assert(!storageExists, "storage file removed after DB delete");
}

/* ───────── RBAC: ADMIN has all permissions ───────── */

function testAdminPermissions() {
  console.log("\n=== RBAC: ADMIN has full permission set ===");

  assertEq(
    userHasPermission(ROLES.ADMIN, [], PERMISSIONS.ASSIGN_EXPORT_BULKING_DOCUMENTATION),
    true,
    "ADMIN has ASSIGN_EXPORT_BULKING_DOCUMENTATION",
  );
  assertEq(
    userHasPermission(ROLES.ADMIN, [], PERMISSIONS.UPDATE_EXPORT_DOCUMENTATION),
    true,
    "ADMIN has UPDATE_EXPORT_DOCUMENTATION",
  );
  assertEq(
    userHasPermission(ROLES.ADMIN, [], PERMISSIONS.UPLOAD_DOCUMENT),
    true,
    "ADMIN has UPLOAD_DOCUMENT",
  );

  for (const perm of ALL_PERMISSION_KEYS) {
    assert(
      userHasPermission(ROLES.ADMIN, [], perm),
      `ADMIN has ${perm}`,
    );
  }

  const leadHasAssign = userHasPermission(
    ROLES.EXPORT_BULKING_LEAD_DOCUMENTATION,
    [],
    PERMISSIONS.ASSIGN_EXPORT_BULKING_DOCUMENTATION,
  );
  assertEq(leadHasAssign, true, "EXPORT_BULKING_LEAD_DOCUMENTATION has ASSIGN permission");

  const docsCanEdit = userHasPermission(
    ROLES.EXPORT_BULKING_DOCUMENTATION,
    [],
    PERMISSIONS.UPDATE_EXPORT_DOCUMENTATION,
  );
  assertEq(docsCanEdit, true, "EXPORT_BULKING_DOCUMENTATION can update documentation");

  const docsCannotAssign = userHasPermission(
    ROLES.EXPORT_BULKING_DOCUMENTATION,
    [],
    PERMISSIONS.ASSIGN_EXPORT_BULKING_DOCUMENTATION,
  );
  assertEq(docsCannotAssign, false, "EXPORT_BULKING_DOCUMENTATION cannot assign PIC documentation");
}

/* ───────── Migration 075 status remap ───────── */

function testMigration075StatusRemap() {
  console.log("\n=== Migration 075 status remap + STATUS_TRANSITIONS ===");

  function remapLegacy(status: string): string {
    if (status === "SI_RECEIVE") return "ARRIVAL";
    if (status === "NPE") return "LOADING";
    return status;
  }

  const seeds = [
    { before: "SI_RECEIVE", after: "ARRIVAL" },
    { before: "NPE", after: "LOADING" },
    { before: "NOMINATION", after: "NOMINATION" },
  ];

  for (const s of seeds) {
    assertEq(remapLegacy(s.before), s.after, `migration maps ${s.before} -> ${s.after}`);
    assert(
      EXPORT_BULKING_STATUSES.includes(remapLegacy(s.before) as ExportBulkingStatus),
      `mapped status ${s.after} is a valid current status`,
    );
  }

  assert(STATUS_TRANSITIONS.ARRIVAL === "AT_BERTH", "ARRIVAL allows AT_BERTH after remap from SI_RECEIVE");
  assert(STATUS_TRANSITIONS.LOADING === "CASE_OFF", "LOADING allows CASE_OFF after remap from NPE");
  assert(!("SI_RECEIVE" in STATUS_TRANSITIONS), "SI_RECEIVE not in STATUS_TRANSITIONS");
  assert(!("NPE" in STATUS_TRANSITIONS), "NPE not in STATUS_TRANSITIONS");
}

/* ───────── API integration helpers ───────── */

type ApiResult = { status: number; body: unknown };

function parseAuthCookies(setCookieHeader: string | null, setCookieList?: string[]): string {
  const parts: string[] = [];
  const sources = setCookieList?.length
    ? setCookieList
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const block of sources) {
    for (const name of ["eos_access", "eos_refresh"]) {
      const match = block.match(new RegExp(`${name}=[^;]+`));
      if (match) parts.push(match[0]);
    }
  }
  return parts.join("; ");
}

async function apiLogin(): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "ChangeMe123" }),
  });
  const setCookieList =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : undefined;
  const cookie = parseAuthCookies(res.headers.get("set-cookie"), setCookieList);
  if (!cookie.includes("eos_access=")) throw new Error("Login failed: no auth cookies (eos_access)");
  const json = (await res.json()) as { data?: { user?: { id?: string } } };
  if (!res.ok) {
    throw new Error(`Login failed: HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  const userId = json.data?.user?.id ?? "";
  return { cookie, userId };
}

async function apiFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<ApiResult> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookie,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/**
 * Confirms the running backend includes security/RBAC fixes.
 * Uses ADMIN assignment probe — unpatched backends return 403.
 */
async function assertBackendSecurityPatched(cookie: string, shipmentId: string): Promise<boolean> {
  console.log("\n=== Preflight: patched backend deployed? ===");

  const assignees = await apiFetch(`${EB}/shipments/documentation-assignees`, cookie);
  if (assignees.status === 403) {
    assert(false, "preflight: ADMIN can list documentation assignees (got 403 — redeploy backend)");
    console.error("\n  ACTION: docker compose up -d --build --force-recreate backend");
    return false;
  }
  assert(assignees.status === 200, "preflight: list documentation assignees returns 200");

  const assigneeList = (assignees.body as { data?: { id: string }[] }).data ?? [];
  const validAssignee = assigneeList[0]?.id;
  if (!validAssignee) {
    console.log("  NOTE: no documentation assignees — skipping assignment probe");
    return true;
  }

  const before = await apiFetch(`${EB}/shipments/${shipmentId}`, cookie);
  const beforeAssignee = (before.body as { data?: { documentation_assigned_to?: string | null } }).data
    ?.documentation_assigned_to;

  const probe = await apiFetch(`${EB}/shipments/${shipmentId}/documentation-assignment`, cookie, {
    method: "PATCH",
    body: JSON.stringify({ assignee_user_id: validAssignee }),
  });

  if (probe.status === 403) {
    assert(false, "preflight: ADMIN PATCH documentation-assignment (got 403 — redeploy backend)");
    console.error("\n  ACTION: docker compose up -d --build --force-recreate backend");
    return false;
  }

  assert(probe.status === 200, "preflight: ADMIN can assign documentation officer");

  // Restore previous assignment
  await apiFetch(`${EB}/shipments/${shipmentId}/documentation-assignment`, cookie, {
    method: "PATCH",
    body: JSON.stringify({ assignee_user_id: beforeAssignee }),
  });

  return true;
}

async function testIdorRegression(cookie: string) {
  console.log("\n=== IDOR regression (nested resource ownership) ===");

  const list = await apiFetch(`${EB}/shipments?limit=20`, cookie);
  assert(list.status === 200, "list shipments returns 200");
  const items = (list.body as { data?: { id: string }[] }).data ?? [];

  let shipmentA: string | null = null;
  let shipmentB: string | null = null;
  let cargoB: string | null = null;
  let siB: string | null = null;
  let invB: string | null = null;
  let plB: string | null = null;
  let siBMessrs: string | null = null;

  for (const item of items) {
    const full = await apiFetch(`${EB}/shipments/${item.id}/full`, cookie);
    const data = (full.body as { data?: Record<string, unknown> }).data ?? {};
    const cargos = (data.cargo_lines as { id: string }[] | undefined) ?? [];
    const sis = (data.shipping_instructions as { id: string; messrs?: string | null }[] | undefined) ?? [];
    const invs = (data.invoices as { id: string }[] | undefined) ?? [];
    const pls = (data.packing_lists as { id: string }[] | undefined) ?? [];

    if (!shipmentB && cargos.length > 0 && sis.length > 0) {
      shipmentB = item.id;
      cargoB = cargos[0]?.id ?? null;
      siB = sis[0]?.id ?? null;
      siBMessrs = sis[0]?.messrs ?? null;
      invB = invs[0]?.id ?? null;
      plB = pls[0]?.id ?? null;
    } else if (shipmentB && item.id !== shipmentB && cargos.length > 0) {
      shipmentA = item.id;
      break;
    }
  }

  if (!shipmentA || !shipmentB || !cargoB || !siB) {
    console.error("  SKIP: need two shipments with cargo + SI");
    return;
  }

  console.log(`  Using shipment A=${shipmentA}, B=${shipmentB}`);

  async function expect404(label: string, method: string, url: string, body?: unknown) {
    const r = await apiFetch(url, cookie, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    assertEq(r.status, 404, label);
  }

  // PATCH first (non-destructive on patched backend; returns 404)
  await expect404("PATCH cross-shipment SI", "PATCH", `${EB}/shipments/${shipmentA}/shipping-instructions/${siB}`, {
    messrs: siBMessrs ?? "unchanged",
  });

  // DELETE attempts — safe only after preflight confirmed patched backend
  await expect404("DELETE cross-shipment cargo", "DELETE", `${EB}/shipments/${shipmentA}/cargos/${cargoB}`);
  await expect404("DELETE cross-shipment SI", "DELETE", `${EB}/shipments/${shipmentA}/shipping-instructions/${siB}`);
  if (invB) {
    await expect404("DELETE cross-shipment invoice", "DELETE", `${EB}/shipments/${shipmentA}/invoices/${invB}`);
  }
  if (plB) {
    await expect404("DELETE cross-shipment packing list", "DELETE", `${EB}/shipments/${shipmentA}/packing-lists/${plB}`);
  }

  const fullB = await apiFetch(`${EB}/shipments/${shipmentB}/full`, cookie);
  const dataB = (fullB.body as { data?: Record<string, unknown> }).data ?? {};
  const cargoStill = ((dataB.cargo_lines as { id: string }[]) ?? []).some((c) => c.id === cargoB);
  const siStill = ((dataB.shipping_instructions as { id: string }[]) ?? []).some((s) => s.id === siB);
  assert(cargoStill, "shipment B cargo still exists after cross-shipment attempts");
  assert(siStill, "shipment B SI still exists after cross-shipment attempts");
}

async function testAdminAssignmentApi(cookie: string, shipmentId: string) {
  console.log("\n=== API: ADMIN documentation assignment ===");

  const assignees = await apiFetch(`${EB}/shipments/documentation-assignees`, cookie);
  const assigneeList = (assignees.body as { data?: { id: string }[] }).data ?? [];
  const validAssignee = assigneeList[0]?.id;

  if (!validAssignee) {
    console.error("  SKIP: no documentation assignees in system");
    return;
  }

  const before = await apiFetch(`${EB}/shipments/${shipmentId}`, cookie);
  const beforeAssignee = (before.body as { data?: { documentation_assigned_to?: string | null } }).data
    ?.documentation_assigned_to;

  const patch = await apiFetch(`${EB}/shipments/${shipmentId}/documentation-assignment`, cookie, {
    method: "PATCH",
    body: JSON.stringify({ assignee_user_id: validAssignee }),
  });

  assertEq(patch.status, 200, "ADMIN PATCH documentation-assignment returns 200");

  const after = await apiFetch(`${EB}/shipments/${shipmentId}`, cookie);
  const afterAssignee = (after.body as { data?: { documentation_assigned_to?: string | null } }).data
    ?.documentation_assigned_to;
  assertEq(afterAssignee, validAssignee, "assignment updated to valid assignee");

  // Restore
  await apiFetch(`${EB}/shipments/${shipmentId}/documentation-assignment`, cookie, {
    method: "PATCH",
    body: JSON.stringify({ assignee_user_id: beforeAssignee }),
  });
}

async function testAssigneeValidation(cookie: string, shipmentId: string, adminUserId: string) {
  console.log("\n=== Assignee validation ===");

  const users = await apiFetch(`${API_BASE}/users`, cookie);
  const userList =
    (users.body as { data?: { id: string; role: string; is_active?: boolean }[] }).data ?? [];

  const inactive = userList.find((u) => u.is_active === false);
  const wrongRole = userList.find(
    (u) => u.is_active !== false && u.role !== "EXPORT_BULKING_DOCUMENTATION" && u.id !== adminUserId,
  );
  const randomUuid = "00000000-0000-4000-8000-000000000001";

  async function expect400(label: string, assigneeId: string) {
    const before = await apiFetch(`${EB}/shipments/${shipmentId}`, cookie);
    const beforeAssignee = (before.body as { data?: { documentation_assigned_to?: string | null } }).data
      ?.documentation_assigned_to;

    const r = await apiFetch(`${EB}/shipments/${shipmentId}/documentation-assignment`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ assignee_user_id: assigneeId }),
    });

    assertEq(r.status, 400, label);
    const after = await apiFetch(`${EB}/shipments/${shipmentId}`, cookie);
    const afterAssignee = (after.body as { data?: { documentation_assigned_to?: string | null } }).data
      ?.documentation_assigned_to;
    assertEq(afterAssignee ?? null, beforeAssignee ?? null, `${label}: no DB change`);
  }

  await expect400("random UUID assignee", randomUuid);

  if (wrongRole) {
    await expect400("wrong role assignee", wrongRole.id);
  } else {
    console.log("  NOTE: wrong-role user not found");
  }

  if (inactive) {
    await expect400("inactive user assignee", inactive.id);
  } else {
    console.log("  NOTE: no inactive user in DB");
  }
}

async function runApiTests() {
  console.log("\n=== API integration (live backend) ===");
  try {
    const { cookie, userId } = await apiLogin();
    const list = await apiFetch(`${EB}/shipments?limit=1`, cookie);
    const shipmentId = (list.body as { data?: { id: string }[] }).data?.[0]?.id;
    if (!shipmentId) {
      console.error("  SKIP: no shipments for API tests");
      return;
    }

    const patched = await assertBackendSecurityPatched(cookie, shipmentId);
    if (!patched) {
      assert(false, "API integration skipped — deploy patched backend before live security tests");
      return;
    }

    await testIdorRegression(cookie);
    await testAdminAssignmentApi(cookie, shipmentId);
    await testAssigneeValidation(cookie, shipmentId, userId);
  } catch (e) {
    failed++;
    failures.push(`API tests aborted: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`  FAIL: API tests aborted: ${e}`);
  }
}

async function main() {
  console.log("Export Bulking — Security / regression checklist\n");

  testAdminPermissions();
  testMigration075StatusRemap();
  await testDocumentUploadInsertFailure();
  await testDocumentDeleteDbFirstOnFailure();
  await testDocumentDeleteSuccessDbFirst();

  if (!SKIP_API) {
    await runApiTests();
  } else {
    console.log("\n=== API integration skipped (SKIP_API=1) ===");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (failed > 0) process.exit(1);
}

main();
