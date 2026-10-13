/**
 * Merged PO line unit allow-list: static seed + po_item_unit_codes (Syncera auto-register).
 */

import { PO_ITEM_UNIT_OPTIONS } from "./po-item-units.js";
import { PoItemUnitRepository } from "../modules/po-intake/repositories/po-item-unit.repository.js";
import { logger } from "../utils/logger.js";

const UNIT_CODE_MAX_LEN = 50;
/** Uppercase alphanumeric plus common separators (Syncera codes e.g. M3, TUB). */
const UNIT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/;

const allowedSet = new Set<string>();
let initPromise: Promise<void> | null = null;
const repo = new PoItemUnitRepository();

export function normalizeUnitCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidUnitCodeFormat(unit: string): boolean {
  const u = normalizeUnitCode(unit);
  return u.length > 0 && u.length <= UNIT_CODE_MAX_LEN && UNIT_CODE_PATTERN.test(u);
}

export function isPoItemUnitAllowed(raw: string): boolean {
  const u = normalizeUnitCode(raw);
  return u.length > 0 && allowedSet.has(u);
}

export function listPoItemUnitCodesSorted(): string[] {
  return Array.from(allowedSet).sort((a, b) => a.localeCompare(b));
}

/** Load DB codes and upsert static seed rows (idempotent). Call once after DB connect. */
export function initPoItemUnitRegistry(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      for (const code of PO_ITEM_UNIT_OPTIONS) {
        allowedSet.add(code);
        try {
          await repo.insertIgnore(code, "seed");
        } catch (err) {
          logger.warn("Failed to seed PO unit code", { code, error: String(err) });
        }
      }
      try {
        const fromDb = await repo.findAllCodes();
        for (const code of fromDb) {
          allowedSet.add(normalizeUnitCode(code));
        }
      } catch (err) {
        logger.error("Failed to load PO unit codes from database", { error: String(err) });
        throw err;
      }
      logger.info("PO item unit registry initialized", { count: allowedSet.size });
    })();
  }
  return initPromise;
}

/**
 * Register a unit from Syncera if format is valid. Adds to in-memory set immediately; persists new codes.
 */
export async function ensureSynceraUnitRegistered(raw: string): Promise<boolean> {
  const unit = normalizeUnitCode(raw);
  if (!isValidUnitCodeFormat(unit)) return false;
  allowedSet.add(unit);
  try {
    const inserted = await repo.insertIgnore(unit, "syncera");
    if (inserted) {
      logger.info("Registered PO unit code from Syncera", { code: unit });
    }
  } catch (err) {
    logger.warn("Failed to persist Syncera PO unit code", { code: unit, error: String(err) });
  }
  return true;
}

/** Test helper: reset in-memory state (does not clear DB). */
export function resetPoItemUnitRegistryForTests(): void {
  allowedSet.clear();
  initPromise = null;
  for (const code of PO_ITEM_UNIT_OPTIONS) {
    allowedSet.add(code);
  }
}
