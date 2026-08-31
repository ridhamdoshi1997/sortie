import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";

export async function createInsforgeServer() {
  return createServerClient({
    cookies: await cookies(),
  });
}

// No cookies() access — for reads that don't need the caller's identity
// (e.g. a public plan list). Touching cookies()/headers() anywhere in a
// route's render forces Next.js to treat the whole route as dynamic
// (no caching, ever); this keeps a route static when the read genuinely
// doesn't depend on who's asking.
export function createInsforgeServerAnon() {
  return createServerClient();
}
