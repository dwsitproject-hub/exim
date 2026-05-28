/**
 * Load `.env` before config/db imports when running scripts with `tsx` (seeds, etc.).
 * Tries parent folder then cwd (matches config: repo root `.env` then `backend/.env`).
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const cwd = process.cwd();
const candidates = [path.join(cwd, "..", ".env"), path.join(cwd, ".env")];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}
