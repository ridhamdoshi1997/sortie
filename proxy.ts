import { NextRequest, NextResponse } from "next/server";
import type { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";
import type { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { updateSession } from "@insforge/sdk/ssr";
import type { CookieOptions, CookieStore } from "@insforge/sdk/ssr";

function createCookieStoreAdapter(
  cookies: RequestCookies | ResponseCookies,
): CookieStore {
  function setCookie(
    name: string,
    value: string,
    options?: CookieOptions,
  ): unknown;
  function setCookie(
    options: { name: string; value: string } & CookieOptions,
  ): unknown;
  function setCookie(
    nameOrOptions: string | ({ name: string; value: string } & CookieOptions),
    value?: string,
    options?: CookieOptions,
  ): unknown {
    if (typeof nameOrOptions === "string") {
      cookies.set({ name: nameOrOptions, value: value ?? "", ...options });
      return;
    }

    cookies.set(nameOrOptions);
    return undefined;
  }

  function deleteCookie(name: string): unknown;
  function deleteCookie(options: { name: string } & CookieOptions): unknown;
  function deleteCookie(
    nameOrOptions: string | ({ name: string } & CookieOptions),
  ): unknown {
    cookies.delete(
      typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name,
    );
    return undefined;
  }

  return {
    get: (name: string) => cookies.get(name),
    set: setCookie,
    delete: deleteCookie,
  };
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const session = await updateSession({
    requestCookies: createCookieStoreAdapter(request.cookies),
    responseCookies: createCookieStoreAdapter(response.cookies),
  });

  if (!session.accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// A real bug (found 2026-08-19): this matcher only covered 3 of the 14
// routes that actually call requireUser()/requireAdmin() (lib/auth.ts,
// lib/admin/auth.ts) — every route NOT listed here never ran updateSession(),
// so an expired 15-minute access token was never silently refreshed from the
// (7-day) refresh token before the page's own Server Component checked
// auth. The symptom: a signed-in user (refresh token still valid) got
// silently bounced to /login (or, for /admin, redirected to / — the admin
// layout's own catch behavior) on any of the uncovered routes once their
// access token expired mid-session, with no visible error — looked
// indistinguishable from "not actually an admin"/"not actually logged in."
// Reproduced directly: curl'd /admin with a session cookie immediately
// after sign-in (200 OK) vs the same cookie a few minutes later, past the
// access token's 15-minute exp claim (307 to /). Every authenticated route
// needs to be listed — there is no wildcard "everything except public
// routes" option here since the matcher is an allowlist by design.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/find-jobs/:path*",
    "/missions/:path*",
    "/saved-jobs/:path*",
    "/career/:path*",
    "/interview/:path*",
    "/resume/:path*",
    "/cover-letter/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/jobs/:path*",
    "/waitlist/:path*",
    "/admin/:path*",
    "/api/settings/:path*",
  ],
};
