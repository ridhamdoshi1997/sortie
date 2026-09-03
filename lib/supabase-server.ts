import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

// Mirrors lib/insforge-server.ts's createInsforgeServer() — a cookie-bound
// client scoped to the calling user's own session, respecting RLS.
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render, which can't set cookies —
            // safe to ignore per Supabase's own documented SSR pattern, since
            // a middleware/route-handler refresh covers the actual write.
          }
        },
      },
    },
  );
}

// Mirrors lib/insforge-server.ts's createInsforgeServerAnon() — no cookies()
// access, so a route reading only public data stays statically renderable.
export function createSupabaseServerAnon() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Mirrors every direct createAdminClient()/createAdminDbClient() call site —
// service-role key, bypasses RLS entirely, server-only, never imported into
// client code. Matches the current_user check public.
// prevent_profiles_admin_field_change() was updated to expect (see
// migrations/Phase 41 schema notes) — this is the role that check looks for.
export function createSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
