/**
 * Multipart/form-data: multer writes uploads to the OS temp dir (`req.file.path`).
 * Handlers that persist files should use `IStorageService.uploadFromPath` to stream into final storage.
 * CSV handlers should use `readMulterFileAsUtf8` (reads temp file then unlinks).
 */

import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tmpdir());
  },
  filename: (_req, file, cb) => {
    const name = `${randomBytes(16).toString("hex")}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload"}`;
    cb(null, name);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_FILE_SIZE },
});

/** Single file field `file` — `req.file.path` is set (disk); no `buffer`. */
export function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    next(err);
  });
}
