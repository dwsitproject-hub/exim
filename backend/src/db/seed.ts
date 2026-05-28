/**
 * Seed one admin user when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set.
 * Safe to run multiple times (idempotent). Use only in development or with RUN_SEED=true.
 */

import "./load-env.js";
import bcrypt from "bcrypt";
import { config } from "../config/index.js";
import { getPool, closeDb } from "./index.js";
import { UserRepository } from "../modules/auth/repositories/user.repository.js";

const SALT_ROUNDS = 12;

async function run(): Promise<void> {
  const nodeEnv = config.nodeEnv ?? "development";
  const runSeed = process.env.RUN_SEED === "true" || process.env.RUN_SEED === "1";
  if (nodeEnv === "production" && !runSeed) {
    console.log("Seed skipped (production without RUN_SEED=true).");
    process.exit(0);
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("Seed skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed admin).");
    process.exit(0);
    return;
  }

  const pool = getPool();
  const userRepo = new UserRepository();
  const existing = await userRepo.findByEmail(email);
  if (existing) {
    console.log("Admin user already exists for:", email);
    await closeDb();
    process.exit(0);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepo.create({
    email,
    passwordHash,
    name: "Admin",
    role: "ADMIN",
  });
  await userRepo.setEmailVerified(user.id);
  console.log("Seeded admin user for:", email);
  await closeDb();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
