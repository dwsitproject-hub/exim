import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Passthrough: forward the SSO provider's OIDC callback to the backend.
 *
 * The SSO provider is configured with redirect URI:
 *   https://<host>/api/auth/oidc/callback
 * which lands here. We forward it to the backend as if it came through the
 * standard /api/backend proxy path, preserving all query parameters
 * (code, state, code_verifier) and cookies so the backend can complete
 * the PKCE token exchange and set auth cookies.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const backendBase = process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "");
  if (!backendBase) {
    return NextResponse.json(
      { success: false, message: "BACKEND_INTERNAL_URL is not set." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const target = `${backendBase}/api/v1/auth/oidc/callback${url.search}`;

  const forwardHeaders = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "host" || k === "connection" || k === "transfer-encoding") return;
    forwardHeaders.set(key, value);
  });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: forwardHeaders,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not reach backend." },
      { status: 502 }
    );
  }

  const outHeaders = new Headers();
  const passThrough = ["content-type", "location", "cache-control", "set-cookie"];
  for (const name of passThrough) {
    const v = upstream.headers.get(name);
    if (v) outHeaders.set(name, v);
  }
  const setCookies = (
    upstream.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (setCookies?.length) {
    for (const c of setCookies) outHeaders.append("set-cookie", c);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
