-- Publisher identity for the redesigned /news page (2026-09-10).
--
-- The News section was rebuilt to a Google-News-grade layout, which is
-- image-led. Verified live against the real Google News RSS feed before
-- writing this: an <item> carries title/link/pubDate/source and NOTHING
-- else — no <media:content>, no <enclosure>, no per-article image of any
-- kind, and the <link> is an opaque news.google.com/rss/articles/CBMi…
-- redirect rather than the publisher's own URL, so an og:image cannot be
-- read from it either without scraping Google's redirect layer.
--
-- What IS available, free and reliably, is the publisher's own domain:
--   <source url="https://www.princegeorgecitizen.com">Prince George Citizen</source>
-- That gives every story a real, correct brand mark through this app's
-- existing /api/logo proxy — honest publisher identity instead of a stock
-- photo standing in for a photo we do not have. This codebase does not
-- fabricate content, and a decorative image implying it illustrates a
-- specific real story would be exactly that.
--
-- image_url is added alongside it, deliberately nullable and currently
-- always null: it is where a real per-article image goes the day a source
-- that actually provides one is wired in (a paid news API), so that day
-- needs no second migration. Nothing writes it today.
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS source_domain text,
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.news_items.source_domain IS
  'Publisher domain from the feed''s own <source url> attribute, e.g. "cbc.ca". Used for the real publisher logo via /api/logo.';
COMMENT ON COLUMN public.news_items.image_url IS
  'Real per-article image. Always NULL until a source that provides one is wired in — never a stock or decorative image.';
