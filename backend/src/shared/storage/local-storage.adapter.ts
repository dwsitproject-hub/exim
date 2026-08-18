/**
 * Local filesystem storage adapter. Placeholder for NFS/shared/object storage.
 *
 * Keys prefixed with `_drafts/` resolve under STORAGE_DRAFT_LOCAL_PATH (local-only).
 * All other keys use STORAGE_LOCAL_PATH / Synology filing root.
 */

import { createReadStream, createWriteStream, mkdirSync, existsSync, unlinkSync } from "fs";
import { stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import { config } from "../../config/index.js";
import type {
  IStorageService,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
} from "./types.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Storage keys for draft files that must not use the Synology filing root. */
export const DRAFT_STORAGE_KEY_PREFIX = "_drafts/";

function getBasePath(): string {
  return config.storage.localPath ?? "./uploads";
}

function getDraftBasePath(): string {
  return config.storage.draftLocalPath ?? "./uploads-draft";
}

function isDraftStorageKey(storageKey: string): boolean {
  return storageKey.replace(/\\/g, "/").startsWith(DRAFT_STORAGE_KEY_PREFIX);
}

function storageKeyToPath(storageKey: string): string {
  const safe = storageKey.replace(/\.\./g, "");
  const base = isDraftStorageKey(safe) ? getDraftBasePath() : getBasePath();
  return join(base, safe);
}

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** `stem_uuid.ext` — keeps a real extension (e.g. .pdf) for OS / DSM type detection. */
const UUID_BEFORE_EXT = new RegExp(`_(${UUID})(\\.[^./\\\\]+)$`, "i");
/** `name_uuid` with no extension. */
const UUID_SUFFIX = new RegExp(`_(${UUID})$`, "i");
/** `uuid_name` (legacy uploads). */
const UUID_PREFIX = new RegExp(`^(${UUID})_`, "i");
/** Accidental `file.pdf_uuid` from older naming — recover `file.pdf` for display. */
const BROKEN_EXT_UUID = new RegExp(`^(.+)\\.([^./\\\\]+)_(${UUID})$`, "i");

/**
 * Stored leaf name: put version id before the last extension so `.pdf` stays the real extension.
 */
export function buildStorageLeafFileName(safeFileName: string, versionId: string): string {
  const lastDot = safeFileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= safeFileName.length - 1) {
    return `${safeFileName}_${versionId}`;
  }
  const stem = safeFileName.slice(0, lastDot);
  const ext = safeFileName.slice(lastDot);
  return `${stem}_${versionId}${ext}`;
}

/** Leaf file part of storage key → user-facing base name (strips document id). */
export function parseStoredLeafBaseName(leaf: string): string {
  const beforeExt = leaf.match(UUID_BEFORE_EXT);
  if (beforeExt && beforeExt.index !== undefined) {
    return leaf.slice(0, beforeExt.index) + beforeExt[2];
  }
  const broken = leaf.match(BROKEN_EXT_UUID);
  if (broken) return `${broken[1]}.${broken[2]}`;
  const tail = leaf.match(UUID_SUFFIX);
  if (tail) return leaf.slice(0, leaf.length - tail[0].length);
  const head = leaf.match(UUID_PREFIX);
  if (head) return leaf.slice(head[0].length);
  return leaf;
}

function resolveStorageKey(options: StorageUploadOptions): string {
  const leaf = buildStorageLeafFileName(options.fileName, options.versionId);
  return options.directoryPrefix
    ? `${options.directoryPrefix.replace(/\.\./g, "")}/${leaf}`
    : `${options.documentId}/${leaf}`;
}

async function ensureWrite(fullPath: string, write: () => Promise<void>): Promise<void> {
  const dir = join(fullPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await write();
}

export class LocalStorageAdapter implements IStorageService {
  async upload(content: Buffer, options: StorageUploadOptions): Promise<StorageUploadResult> {
    if (content.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit`);
    }
    const storageKey = resolveStorageKey(options);
    const fullPath = storageKeyToPath(storageKey);
    await ensureWrite(fullPath, () => writeFile(fullPath, content));
    return { storageKey };
  }

  async uploadFromPath(sourcePath: string, options: StorageUploadOptions): Promise<StorageUploadResult> {
    const st = await stat(sourcePath);
    if (st.size > MAX_FILE_SIZE_BYTES) {
      await unlink(sourcePath).catch(() => {});
      throw new Error(`File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit`);
    }
    const storageKey = resolveStorageKey(options);
    const fullPath = storageKeyToPath(storageKey);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const rs = createReadStream(sourcePath);
    const ws = createWriteStream(fullPath);
    try {
      await pipeline(rs, ws);
    } catch (e) {
      await unlink(sourcePath).catch(() => {});
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
      throw e;
    }
    await unlink(sourcePath).catch(() => {});
    return { storageKey };
  }

  async download(storageKey: string): Promise<StorageDownloadResult | null> {
    const fullPath = storageKeyToPath(storageKey);
    if (!existsSync(fullPath)) return null;
    const leaf = storageKey.split("/").pop() ?? "document";
    const fileName = parseStoredLeafBaseName(leaf);
    const stream = createReadStream(fullPath);
    return { stream, fileName };
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = storageKeyToPath(storageKey);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    return existsSync(storageKeyToPath(storageKey));
  }

  /** Absolute path for a stored key (for OCR that needs a filesystem path). */
  resolveAbsolutePath(storageKey: string): string {
    return storageKeyToPath(storageKey);
  }
}
