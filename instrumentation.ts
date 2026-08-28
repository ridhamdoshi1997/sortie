// Next.js instrumentation hook — loads the right Sentry config for
// whichever runtime this server process is actually running under.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Real bug found live (2026-08-28): every server-side fetch() to
    // InsForge's storage CDN (cdn.insforge.dev, CloudFront-backed) —
    // insforge.storage.from(...).download() and any signed-URL fetch —
    // failed with a generic STORAGE_ERROR wrapping an ECONNRESET, even
    // though the exact same signed URL succeeded from a browser (confirmed
    // via XHR) and the bare domain worked fine over curl. Root-caused with
    // a minimal repro script (node --eval fetch(url)): Node's default DNS
    // resolution order tries this domain's IPv6 addresses first, and IPv6
    // routing to CloudFront resets mid-TLS-read in this environment.
    // `dns.setDefaultResultOrder('ipv4first')` fixed it immediately —
    // confirmed via the same repro before wiring it in here. Scoped to the
    // nodejs runtime only (the edge runtime has no `node:dns` module and
    // never hits this code path anyway).
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
}
