"use client";

import { createBrowserClient } from "@supabase/ssr";

// Mirrors lib/insforge-client.ts's exported `insforge` browser client.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
