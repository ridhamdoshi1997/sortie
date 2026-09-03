"use client";

import { supabase } from "@/lib/supabase-client";
import { wrapAuth } from "@/lib/insforge-auth-shim";

// MIGRATION SHIM (Phase 41+) — see lib/insforge-server.ts's own comment for
// the full rationale. Same pattern, browser side: real call sites import
// `insforge` from this file and use `.database`/`.auth`/`.storage` — kept
// stable so those call sites don't need touching.
export const insforge = {
  database: supabase,
  auth: wrapAuth(supabase),
  storage: supabase.storage,
};
