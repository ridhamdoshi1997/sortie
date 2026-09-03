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

    const callbackUrl = new URL("/callback", request.nextUrl.origin);
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
