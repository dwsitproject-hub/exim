import { NextRequest, NextResponse } from "next/server";

/** Avoid stale dashboard/report data when query string (month, year, etc.) changes. */
export const dynamic = "force-dynamic";

/** Backend routes live under this prefix (matches Express app). */
const API_V1_PREFIX = "/api/v1";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function internalBase(): string | null {
  const raw = process.env.BACKEND_INTERNAL_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function buildTarget(pathSegments: string[], search: string): string | null {
  const base = internalBase();
  if (!base) return null;
  const rest = pathSegments.length > 0 ? pathSegments.join("/") : "";
  const path = rest ? `${API_V1_PREFIX}/${rest}` : API_V1_PREFIX;
  return `${base}${path}${search}`;
}

function forwardRequestHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!HOP_BY_HOP.has(k)) out.set(key, value);
  });
  out.delete("content-length");
  return out;
}

function forwardResponseHeaders(upstream: Response): Headers {
  const out = new Headers();
  const pass = ["content-type", "content-disposition", "cache-control"];
  for (const name of pass) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (getSetCookie?.length) {
    for (const c of getSetCookie) {
      out.append("set-cookie", c);
    }
  }
  return out;
}

async function proxy(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const url = new URL(req.url);
  const target = buildTarget(pathSegments, url.search);
  if (!target) {
    return NextResponse.json(
      { success: false, message: "API proxy misconfigured: set BACKEND_INTERNAL_URL on the Next.js server." },
      { status: 503 }
    );
  }

  const method = req.method;
  const headers = forwardRequestHeaders(req);

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (method !== "GET" && method !== "HEAD") {
    const body = req.body;
    if (body) {
      init.body = body;
      (init as RequestInit & { duplex?: string }).duplex = "half";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not reach backend (BACKEND_INTERNAL_URL)." },
      { status: 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardResponseHeaders(upstream),
  });
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
