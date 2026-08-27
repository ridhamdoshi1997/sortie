// Deno Subhosting edge function, not part of the Next.js app — excluded
// from tsconfig.json's include set (its global `Deno` isn't a Next.js/DOM
// type), deployed separately via `npx @insforge/cli functions deploy`.
//
// Portal Scanner (build-plan.md Phase 8) — final fallback tier for
// lib/reresolveApplyLink.ts. Used only when a job's apply link is
// low-quality AND neither the free ATS-slug guess nor a fresh SerpApi
// search found anything better. Runs a real Google search via Apify's free
// apify/rag-web-browser Actor ("{company} careers {title}") and returns the
// organic result URLs for the caller to run through its own trust
// classifier (lib/applyLinkTrust.ts) — this function makes no trust
// decision itself, it only fetches candidates.
//
// Auth pattern per InsForge's Apify webscraper skill: fetch a fresh,
// short-lived Apify token via this project's own token-bridge endpoint
// (INSFORGE_BASE_URL/API_KEY are auto-injected into every edge function),
// then call Apify's REST API directly with it — never a personal Apify key
// stored as a secret.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// searchResult.url is a google.com/goto?url=... redirect-tracking link, not
// the real destination — confirmed live against a real query before writing
// this. metadata.url (the page the browser actually landed on, after any
// redirect) is the real one; metadata.canonicalUrl as a fallback for pages
// that declare a different canonical.
type ApifySearchResult = { metadata?: { url?: string; canonicalUrl?: string } };

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { company, title } = await req.json();
    if (!company || !title) {
      return new Response(JSON.stringify({ error: "company and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
    const apiKey = Deno.env.get("API_KEY");

    const tokenRes = await fetch(`${baseUrl}/api/webscraper/apify/token`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch Apify token", urls: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { accessToken } = await tokenRes.json();

    // apify/rag-web-browser (free) — queries Google, scrapes the top
    // organic results, returns each result's real URL. run-sync-get-
    // dataset-items runs the Actor and returns its dataset in one call, no
    // polling — this Actor typically finishes in well under the function's
    // own timeout.
    const query = `${company} careers ${title}`;
    const actorRes = await fetch(
      `https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, maxResults: 4 }),
      }
    );

    if (!actorRes.ok) {
      return new Response(JSON.stringify({ error: `Apify run failed: ${actorRes.status}`, urls: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: ApifySearchResult[] = await actorRes.json();
    const urls = items
      .map((i) => i.metadata?.url ?? i.metadata?.canonicalUrl)
      .filter((u): u is string => Boolean(u));

    return new Response(JSON.stringify({ urls }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error), urls: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
