import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

const allowedProviders = new Set(["google", "github", "microsoft"]);

// This app's own URL/button naming doesn't always match Supabase's actual
// GoTrue provider identifiers — confirmed live (2026-09-02): calling
// signInWithOAuth("microsoft") fails with "Provider microsoft could not be
// found" because Supabase's real identifier for this provider is "azure"
// (matches how its own dashboard labels the provider). Map app-facing names
// to Supabase's real ones here rather than changing the button/route
// naming everywhere else.
const SUPABASE_PROVIDER_NAMES: Record<string, string> = {
  microsoft: "azure",
};

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const loginUrl = new URL("/login", request.url);

  try {
    const { provider } = await context.params;
    const normalizedProvider = provider.toLowerCase();

    if (!allowedProviders.has(normalizedProvider)) {
      loginUrl.searchParams.set("error", "provider");
      return NextResponse.redirect(loginUrl);
    }

    // Prefer an explicitly configured public URL over the origin this
    // request happened to arrive on (2026-09-03, direct user report: OAuth
    // on preview completed and then landed back on localhost).
    //
    // The origin itself was never wrong — a preview request correctly
    // produced redirect_to=<preview>/callback. The failure is on Supabase's
    // side: GoTrue silently ignores a redirect_to that isn't in its Redirect
    // URLs allow-list and falls back to the project's Site URL, which is
    // still localhost. That allow-list is the fix, but it can't be
    // maintained against request.nextUrl.origin alone, because Vercel mints
    // a NEW hostname for every single deployment — each one would need
    // adding, and OAuth would break again on the next deploy.
    //
    // NEXT_PUBLIC_APP_URL pins the callback to one stable hostname per
    // environment, so exactly one URL per environment needs allow-listing,
    // permanently. Deliberately NOT lib/siteUrl.ts's getSiteUrl(): its
    // VERCEL_URL fallback is that same per-deploy hostname, which is the
    // problem being solved here. When the variable is unset (local dev, and
    // any environment not yet configured) this falls back to the previous
    // behaviour exactly.
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const callbackUrl = new URL("/callback", configuredOrigin || request.nextUrl.origin);
    // No manual code-verifier cookie needed — Supabase's PKCE flow manages
    // its own verifier cookie internally via this same cookies()-bound
    // client's adapter, written automatically as a side effect of this call.
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.signInWithOAuth(
      SUPABASE_PROVIDER_NAMES[normalizedProvider] ?? normalizedProvider,
      {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    );

    if (error || !data.url) {
      console.error("[auth/oauth]", error);
      loginUrl.searchParams.set("error", "oauth");
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(data.url);
  } catch (error) {
    console.error("[auth/oauth]", error);
    loginUrl.searchParams.set("error", "oauth");
    return NextResponse.redirect(loginUrl);
  }
}
