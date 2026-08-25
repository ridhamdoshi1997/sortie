import Link from "next/link";
import { ExternalLink } from "lucide-react";

type Props = {
  applyUrl: string | null;
  company: string;
};

// Sticky, not fixed (per ui-rules.md's fixed-position ban). Placed as the
// LAST element in <main> (see app/find-jobs/[id]/page.tsx) — its own
// natural/static position is at the very bottom of the page, off-screen
// below the fold, so `bottom-4` sticky pins it to the viewport bottom for
// the entire scroll from page load through the rest of the content, only
// settling into normal flow once you actually reach the true end of the
// page. Positioned right after JobActionBar instead, it would just render
// in-flow (redundant second Apply button stacked under the first) until
// you scrolled nearly the whole page — placement here is what makes it
// behave like Apple's persistent floating CTA, not the sticky class alone.
//
// Known limitation, reverted back to this from a `fixed` version on
// 2026-07-28 at the user's request: sticky+bottom only really catches an
// element as you scroll UP past it, not while scrolling DOWN through more
// content below it — so this won't stay visible for the ENTIRE scroll the
// way a true fixed floating button would. Kept anyway, deliberately, to
// stay inside ui-rules.md's fixed-position ban rather than carve out an
// exception for it.
export function FloatingApplyButton({ applyUrl, company }: Props) {
  if (!applyUrl) return null;

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mx-auto flex w-full max-w-6xl justify-center px-4 sm:px-6 lg:px-8">
      <Link
        href={applyUrl}
        target="_blank"
        rel="noreferrer"
        className="btn-signal pointer-events-auto inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-accent-foreground"
      >
        Apply at {company}
        <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}
