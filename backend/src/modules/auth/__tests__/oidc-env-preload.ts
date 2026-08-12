/** Preload before OIDC tests so config sees JWT/DATABASE env (imports are hoisted). */
process.env.DATABASE_URL ??= "postgres://eos:eos@localhost:5433/eos_db";
process.env.JWT_ACCESS_SECRET ??= "test-oidc-jwt-secret-do-not-use-in-prod";
