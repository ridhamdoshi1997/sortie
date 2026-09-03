import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { wrapAuth } from "@/lib/insforge-auth-shim";

// MIGRATION SHIM (Phase 41+) — this file is now Supabase-backed despite its
// name/filename. Kept as-is deliberately: ~100+ call sites across the
// codebase import createInsforgeServer()/createInsforgeServerAnon() and use
// `.database.from()/.rpc()` and a handful of `.auth.*` methods — since both
// InsForge's and Supabase's SDKs are PostgREST-based, those call shapes are
// genuinely compatible, so this wraps a real Supabase client with an
// `insforge`-shaped facade instead of touching every call site individually.
// Rename this file (and lib/insforge-client.ts, lib/admin/client.ts) once
// the migration is fully verified and stable — not before.
//
// The auth-shaping logic itself lives in lib/insforge-auth-shim.ts, NOT
// here — a real, confirmed-live bug: this file imports "next/headers"
// (server-only), and lib/admin/client.ts previously imported wrapAuth
// directly from here, which dragged "next/headers" into lib/admin/client.ts's
// dependency graph. That file gets bundled into CLIENT code via
// lib/models.ts → components/shared/SiteModelSelector.tsx → Navbar.tsx,
// breaking the entire app ("You're importing a module that depends on
// next/headers... in the Pages Router" — a real Next.js error, not a type
// error, caught only by actually running the app). Never import anything
// from THIS file into lib/admin/client.ts again — always go through the
// shared, headers-free lib/insforge-auth-shim.ts instead.

// Deliberately NOT spreading `...client` here — that widens/erases the real
// client's generic method overloads (confirmed live: caused a real
// `TS2347: Untyped function calls may not accept type arguments` error on
// every .maybeSingle<T>()/.select<T>() call site once tried). `database:
// client` is a direct reference to the untouched client, not a copy, so its
// exact generic signatures survive. No call site in this codebase calls a
// method directly on the top-level `insforge` object outside
// .database/.auth/.storage, so nothing else needs exposing here.
function wrapClient<T extends SupabaseClient>(client: T) {
  return {
    database: client,
    auth: wrapAuth(client),
    storage: client.storage,
  };
}

export async function createInsforgeServer() {
  const cookieStore = await cookies();
  const client = createServerClient(
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
            // Server Component render — can't set cookies, safe to ignore
            // (matches Supabase's own documented SSR pattern).
          }
        },
      },
    },
  );
  return wrapClient(client);
}

export function createInsforgeServerAnon() {
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
  return wrapClient(client);
}
