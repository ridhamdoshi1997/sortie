// A bound on database reads that run during `next build`.
//
// Statically prerendered routes execute their data fetching at BUILD time, and
// Next.js gives each route 60 seconds before it fails the entire build. None of
// these reads carried a timeout of their own, so a slow database did not
// degrade a marketing page -- it broke the deploy outright.
//
// That is how a database incident became unrecoverable (2026-09-08). The
// database was saturated, so `/interview-questions` and then `/sitemap.xml`
// each hung past 60s and `npm run build` exited 1 -- and the deploy being
// blocked was the one carrying CRAWL_PAUSED, the fix for the saturation. A
// database too slow to answer was preventing the change that would let it
// recover from shipping at all. Bounding these reads is what breaks that
// circle.
//
// The fallback is always the honest empty value, which these pages already
// render as "nothing published yet", and every one of them sets
// `revalidate`, so an empty build-time render repairs itself on the next
// revalidation without a redeploy. A sitemap missing some URLs for an hour is
// a far smaller problem than a deploy that cannot ship.
//
// 15s, not 60: several of these can run inside one route, and the budget is
// per ROUTE, not per query. Callers with more than one read should also run
// them concurrently so the route's cost is the slowest read, not their sum.

const DEFAULT_TIMEOUT_MS = 15_000;

export async function withBuildTimeout<T>(
    label: string,
    work: () => Promise<T>,
    fallback: T,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } catch (error) {
        // Warned, never thrown. The whole point is that this cannot fail a build.
        console.warn(`[buildTimeFetch] ${label} unavailable: ${(error as Error).message}`);
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
