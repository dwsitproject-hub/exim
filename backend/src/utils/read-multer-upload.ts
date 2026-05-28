/**
 * Read text from a multer disk upload and remove the temp file.
 * Falls back to buffer if present (legacy).
 */

import type { Express } from "express";
import { readFile, unlink } from "fs/promises";

export async function readMulterFileAsUtf8(file: Express.Multer.File | undefined): Promise<string> {
  if (!file) return "";
  const withPath = file as Express.Multer.File & { path?: string };
  if (withPath.path) {
    try {
      return await readFile(withPath.path, "utf8");
    } finally {
      await unlink(withPath.path).catch(() => {});
    }
  }
  const withBuf = file as Express.Multer.File & { buffer?: Buffer };
  if (withBuf.buffer?.length) {
    return withBuf.buffer.toString("utf8");
  }
  return "";
}
