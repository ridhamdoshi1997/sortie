// Shared site-URL resolver — same fallback chain already established by
// lib/email/resend.ts's buildUnsubscribeUrl (NEXT_PUBLIC_APP_URL isn't set
// anywhere in this project yet, so this falls back to Vercel's own
// auto-provided VERCEL_URL in a real deployment, then bare localhost for
// local dev). Used by app/sitemap.ts and app/robots.ts, which both need
// the same canonical base URL. Set NEXT_PUBLIC_APP_URL explicitly once a
// real custom domain exists.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");
}
