import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Supabase's own documented Next.js middleware pattern — the createServerClient
// instance's cookie adapters both read the incoming request's cookies AND
// (critically) rewrite them onto a fresh NextResponse whenever getUser()
// triggers a token refresh, so the refreshed session rides along on this
// response and every downstream Server Component sees it. Replaces
// InsForge's updateSession()/createCookieStoreAdapter() — same job, no
// InsForge-specific adapter shape needed since @supabase/ssr's cookie
// interface (getAll/setAll) is what NextRequest/NextResponse's own cookie
// APIs already speak natively.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() (not getSession()) is deliberate — it re-validates the token
  // against Supabase's Auth server rather than trusting a possibly-stale
  // cookie, and it's what triggers the silent refresh via setAll() above
  // when the access token has expired but the refresh token is still valid.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Unchanged from the InsForge version — this matcher's own real-bug history
// (found 2026-08-19: routes missing from this list never got their access
// token refreshed, silently bouncing a signed-in user to /login) is
// independent of which backend sits behind proxy() and still applies.
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
