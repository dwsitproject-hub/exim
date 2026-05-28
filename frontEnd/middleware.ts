/**
 * Route protection strategy — centralized (cursor-rules §3.2).
 * Protects routes that require auth; redirects unauthenticated users to login.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE_NAME } from "@/lib/cookies";
import { LOGIN_PATH, DEFAULT_AFTER_LOGIN_PATH } from "@/lib/constants";

/** Paths that require authentication (exact or prefix). */
const PROTECTED_PREFIXES = ["/dashboard"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = accessToken ? DEFAULT_AFTER_LOGIN_PATH : LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  if (!accessToken) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/:path*"],
};
