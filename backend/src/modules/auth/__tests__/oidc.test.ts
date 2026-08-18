/**
 * Unit tests for DWS Hub OIDC helpers, id_token verification, and loginWithOidc.
 * Run: node --import ./src/modules/auth/__tests__/oidc-env-preload.ts --import tsx --test src/modules/auth/__tests__/oidc.test.ts
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "crypto";
import { createServer } from "node:http";
import { SignJWT, exportJWK } from "jose";
import { buildTokenRequestBody } from "../oidc/oidc-token.js";
import { codeChallengeS256, createPkceBundle, generateCodeVerifier } from "../oidc/oidc-pkce.js";
import { verifyIdToken, clearJwksCache } from "../oidc/oidc-verify.js";
import { AuthService } from "../services/auth.service.js";
import { OidcService } from "../services/oidc.service.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import type { UserRow } from "../dto/index.js";

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("OIDC PKCE", () => {
  it("creates S256 code_challenge matching RFC 7636", () => {
    const verifier = generateCodeVerifier();
    const expected = base64Url(createHash("sha256").update(verifier).digest());
    assert.equal(codeChallengeS256(verifier), expected);
  });

  it("createPkceBundle returns all fields", () => {
    const b = createPkceBundle();
    assert.ok(b.codeVerifier.length >= 32);
    assert.ok(b.codeChallenge.length > 0);
    assert.ok(b.state.length > 0);
    assert.ok(b.nonce.length > 0);
    assert.equal(b.codeChallenge, codeChallengeS256(b.codeVerifier));
  });
});

describe("OIDC token request body", () => {
  it("builds JSON grant fields required by Hub", () => {
    const body = buildTokenRequestBody({
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:3002/api/backend/auth/oidc/callback",
      clientId: "eos",
    });
    assert.deepEqual(body, {
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "http://localhost:3002/api/backend/auth/oidc/callback",
      client_id: "eos",
      code_verifier: "verifier",
    });
  });
});

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@example.com",
    password_hash: "$2b$12$placeholder",
    name: "Test User",
    role: "VIEWER",
    is_active: true,
    email_verified_at: new Date(),
    oidc_sub: null,
    permission_overrides: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeAuthService(repo: {
  findByOidcSubAny: (sub: string) => Promise<UserRow | null>;
  findByEmailAny: (email: string) => Promise<UserRow | null>;
  linkOidcSub: (userId: string, sub: string) => Promise<void>;
}) {
  const refreshRepo = {
    create: async () => undefined,
    findByToken: async () => null,
    revokeByToken: async () => {},
  };
  return new AuthService(repo as never, refreshRepo as never, {} as never, {} as never);
}

describe("AuthService.loginWithOidc", () => {
  it("issues session when oidc_sub already linked", async () => {
    const user = makeUser({ oidc_sub: "hub-sub-1" });
    let linked = false;
    const svc = makeAuthService({
      findByOidcSubAny: async (sub) => (sub === "hub-sub-1" ? user : null),
      findByEmailAny: async () => null,
      linkOidcSub: async () => {
        linked = true;
      },
    });
    const session = await svc.loginWithOidc("hub-sub-1", "user@example.com");
    assert.equal(session.user.email, "user@example.com");
    assert.ok(session.access_token);
    assert.ok(session.refresh_token);
    assert.equal(linked, false);
  });

  it("links oidc_sub on first email match", async () => {
    const user = makeUser({ oidc_sub: null });
    const links: string[] = [];
    const svc = makeAuthService({
      findByOidcSubAny: async () => null,
      findByEmailAny: async (email) => (email === "user@example.com" ? user : null),
      linkOidcSub: async (userId, sub) => {
        links.push(`${userId}:${sub}`);
      },
    });
    const session = await svc.loginWithOidc("hub-sub-new", "User@Example.com");
    assert.deepEqual(links, [`${user.id}:hub-sub-new`]);
    assert.equal(session.user.email, "user@example.com");
  });

  it("rejects unknown users (not provisioned)", async () => {
    const svc = makeAuthService({
      findByOidcSubAny: async () => null,
      findByEmailAny: async () => null,
      linkOidcSub: async () => {
        assert.fail("should not link");
      },
    });
    await assert.rejects(
      () => svc.loginWithOidc("hub-sub-x", "unknown@example.com"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not provisioned/i);
        return true;
      }
    );
  });

  it("rejects inactive linked user", async () => {
    const user = makeUser({ oidc_sub: "hub-sub-1", is_active: false });
    const svc = makeAuthService({
      findByOidcSubAny: async () => user,
      findByEmailAny: async () => null,
      linkOidcSub: async () => {},
    });
    await assert.rejects(
      () => svc.loginWithOidc("hub-sub-1", "user@example.com"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /inactive/i);
        return true;
      }
    );
  });
});

describe("OidcService", () => {
  it("isEnabled returns a boolean from config", () => {
    const svc = new OidcService({} as never);
    assert.equal(typeof svc.isEnabled(), "boolean");
  });
});

describe("verifyIdToken", () => {
  before(() => {
    clearJwksCache();
  });

  it("accepts valid RS256 id_token; rejects wrong aud and nonce", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = await exportJWK(publicKey);
    jwk.alg = "RS256";
    jwk.use = "sig";
    jwk.kid = "test-kid";

    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const jwksUri = `http://127.0.0.1:${addr.port}/jwks`;

    const issuer = "https://hub.test";
    const audience = "eos";
    const nonce = "nonce-abc";

    try {
      const idToken = await new SignJWT({ email: "a@b.com", nonce })
        .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
        .setSubject("sub-1")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      const claims = await verifyIdToken({
        idToken,
        jwksUri,
        issuer,
        audience,
        expectedNonce: nonce,
      });
      assert.equal(claims.sub, "sub-1");
      assert.equal(claims.email, "a@b.com");

      await assert.rejects(() =>
        verifyIdToken({
          idToken,
          jwksUri,
          issuer,
          audience: "wrong-client",
          expectedNonce: nonce,
        })
      );

      await assert.rejects(
        () =>
          verifyIdToken({
            idToken,
            jwksUri,
            issuer,
            audience,
            expectedNonce: "wrong-nonce",
          }),
        /nonce mismatch/i
      );
    } finally {
      clearJwksCache();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
