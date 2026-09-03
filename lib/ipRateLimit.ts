import { createAdminClient } from "@/lib/admin/client";

// IP-based daily rate limiting for genuinely public, unauthenticated
// routes — the free ATS score checker (build-plan.md §I) is the first one
// this app has. Local service-client helper, same pattern as
// actions/account.ts/actions/referrals.ts, not lib/admin/client.ts's
// admin-route-gated createAdminDbClient.
function serviceClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

type IpRateLimitResult = { allowed: true } | { allowed: false; error: string };

export async function checkIpRateLimit(ip: string, route: string, maxPerDay: number): Promise<IpRateLimitResult> {
  const admin = serviceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await admin.database
    .from("ip_usage_daily")
    .select("id,count")
    .eq("ip", ip)
    .eq("route", route)
    .eq("day", today)
    .maybeSingle<{ id: string; count: number }>();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= maxPerDay) {
    return { allowed: false, error: `You've hit today's free limit (${maxPerDay}/day) for this tool — try again tomorrow, or sign up free for unlimited job-specific checks.` };
  }

  if (existing) {
    await admin.database.from("ip_usage_daily").update({ count: currentCount + 1 }).eq("id", existing.id);
  } else {
    await admin.database.from("ip_usage_daily").insert([{ ip, route, day: today, count: 1 }]);
  }

  return { allowed: true };
}

// Vercel sets x-forwarded-for on every request; falls back to x-real-ip,
// then a fixed placeholder (shared, conservative — effectively means "no
// real IP available" gets bucketed together) rather than throwing, since
// this must never crash a public page over a missing header.
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
