"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Check, Layers, Loader2, PenLine, Sparkles, Target, Zap } from "lucide-react";

import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { LimitReachedModal } from "@/components/shared/LimitReachedModal";
import { FrameworkRewritePanel } from "@/components/documents/FrameworkRewritePanel";
import { PlaceholderFixPanel, findPlaceholderBullets } from "@/components/documents/PlaceholderFixPanel";
import { useDocumentChat } from "@/components/documents/useDocumentChat";
import { applyFormattingFixes } from "@/lib/atsAutoFix";
import { computeMatchRate } from "@/lib/atsMatchRate";
import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type RevisedData = { reply?: string; sections?: ResumeSection[]; style?: ResumeStyle; scoreJump?: ScoreJumpResult | null };

// Action Plan, rebuilt 2026-09-11 at the user's direction ("you can
// completely [rebuild a] useful action plan instead of this currently we
// have"). The old version was a flat list of six chips that all did the
// same thing — fire a full AI revision — labelled with a vibe ("High
// impact") rather than a consequence. Three concrete problems it had:
//
//   1. EVERY item cost an AI call. Four missing keywords meant four
//      separate ~25s revisions, four usage units, and four full rewrites of
//      the same résumé, each one built on the last. The user asked about
//      exactly this.
//   2. The formatting problems it could have fixed for FREE, instantly and
//      deterministically, were not offered at all.
//   3. "High impact" was unquantified. Nothing told you whether an item was
//      worth nine points or one.
//
// This version is ordered by REAL point value, computed from
// lib/atsMatchRate's own transparent weights — `weight - earned` per
// category is exactly how many points are recoverable there, so these
// numbers are arithmetic, not estimates. Free fixes come first, and the
// keyword work is ONE batched call instead of one per keyword.


type PlanItem =
  | { kind: "instant"; points: number; label: string; detail: string }
  | { kind: "placeholder"; points: number; label: string; detail: string }
  | { kind: "framework"; points: number; label: string; detail: string }
  | { kind: "profile"; points: number; label: string; detail: string }
  | { kind: "keywords"; points: number; label: string; detail: string; prompt: string }
  | { kind: "bullet"; points: number; label: string; detail: string; company: string; bulletText: string };

type Props = {
  jobId: string;
  scoreJump: ScoreJumpResult | null;
  qualityAnalysis: ResumeAnalysis | null;
  style: ResumeStyle;
  sections: ResumeSection[];
  contact: { email: string | null; phone: string | null; location: string | null };
  /** The job posting's text — passed to computeMatchRate so the plan and the ATS card score identically. */
  postingText?: string;
  onFocusBullet: (company: string, bulletText: string) => void;
  onRevised: (data: RevisedData) => void;
  onCommitSections: (sections: ResumeSection[]) => void;
  onCommitStyle: (style: ResumeStyle) => void;
};

export function ActionPlan({
  jobId,
  scoreJump,
  qualityAnalysis,
  style,
  sections,
  contact,
  postingText,
  onFocusBullet,
  onRevised,
  onCommitSections,
  onCommitStyle,
}: Props) {
  const { isPending, send, error, limit, clearLimit, justUpdated, messages, isShared } = useDocumentChat({
    jobId,
    kind: "resume",
    onRevised,
  });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  // The batch placeholder workspace, opened inline from its own row. The
  // framework choice lives INSIDE it, applying to the whole batch, so
  // CAR/STAR/PAR/SOAR are one decision rather than one per bullet.
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [showFrameworks, setShowFrameworks] = useState(false);
  const placeholderBullets = useMemo(() => findPlaceholderBullets(sections), [sections]);

  const lastReply = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null;

  const items = useMemo<PlanItem[]>(() => {
    // Derived INSIDE the memo: `scoreJump?.matchedKeywords ?? []` builds a
    // fresh array every render, so as a dependency it would invalidate this
    // on every single render and defeat the memo entirely.
    const matched = scoreJump?.matchedKeywords ?? [];
    const missing = scoreJump?.missingKeywords ?? [];
    const rate = computeMatchRate(style, sections, contact, matched, missing, postingText);
    const out: PlanItem[] = [];

    // Points recoverable in a category = its weight minus what it earned.
    // Exact by construction, which is why these can be shown as numbers.
    const searchabilityGap = Math.round(
      (rate.categories.find((c) => c.key === "searchability")?.weight ?? 0) -
        (rate.categories.find((c) => c.key === "searchability")?.earned ?? 0),
    );
    const hardGap = Math.round(
      (rate.categories.find((c) => c.key === "hard_skills")?.weight ?? 0) -
        (rate.categories.find((c) => c.key === "hard_skills")?.earned ?? 0),
    );

    // FREE, deterministic, instant — no AI call, no usage consumed. These go
    // first because they are pure upside: a click, no wait, no cost.
    const { applied } = applyFormattingFixes(style, sections);
    if (applied.length > 0 && searchabilityGap > 0) {
      out.push({
        kind: "instant",
        points: searchabilityGap,
        label: applied.length === 1 ? applied[0].label : `Fix ${applied.length} formatting issues`,
        detail: applied.map((a) => a.label).join(" · "),
      });
    }

    // Contact gaps are real searchability points but cannot be auto-fixed
    // here — they live on the profile and flow onto every résumé.
    const missingContact = [
      !contact.email && "email",
      !contact.phone && "phone",
      !contact.location && "location",
    ].filter(Boolean) as string[];
    if (missingContact.length > 0) {
      out.push({
        kind: "profile",
        points: 6,
        label: `Add your ${missingContact.join(" and ")} to your profile`,
        detail: "Parsers read contact details as structured fields — a missing one can drop you from recruiter searches.",
      });
    }

    // ONE call for every missing hard skill, not one per skill. Soft skills
    // are deliberately excluded: they are worth a fraction of the points and
    // padding a résumé with trait words is the stuffing this app warns about.
    //
    // From the re-checked result, not the AI list: a skill the résumé text
    // already contains is not missing, and offering to "work in" something
    // the summary says word for word spends a rewrite for nothing.
    const missingHard = rate.missingHardSkills;
    if (missingHard.length > 0 && hardGap > 0) {
      out.push({
        kind: "keywords",
        points: hardGap,
        label: `Work in ${missingHard.length} missing skill${missingHard.length === 1 ? "" : "s"}`,
        detail: missingHard.join(", "),
        prompt:
          `Add these skills from the job posting to my résumé, handling all of them in this one pass: ${missingHard.join(", ")}.\n\n` +
          `For each one that my existing experience already supports, weave it into the most relevant bullet or the summary now, and tell me which bullet you changed for which skill.\n\n` +
          `For any that nothing in my material supports, do NOT put it in the résumé and do NOT just tell me the information is missing. Instead propose it: draft one specific, ready-to-use bullet that someone with my exact background would plausibly have done involving that skill, written exactly as it would appear on the résumé. Present those as drafts awaiting my confirmation, say plainly that you have not added them, and add them only if I confirm they are true.`,
      });
    }

    // Placeholder blanks, as ONE item covering all of them.
    //
    // This used to push one row per affected bullet. With seven of them the
    // plan became seven identical "Fill in a placeholder blank" labels, each
    // truncated mid-sentence so the bullet could not be read, each needing
    // its own click and its own AI call — and between them they shoved every
    // genuinely valuable item off the list. The user's verdict was blunt and
    // right: "it's pathetic way to give the options."
    //
    // The underlying decision is not N decisions, it is one: the résumé is
    // missing numbers and only the candidate has them. So this opens a
    // single workspace showing every gap at once, and fixes the lot in one
    // pass.
    const placeholderBullets = findPlaceholderBullets(sections);
    if (placeholderBullets.length > 0) {
      out.push({
        kind: "placeholder",
        points: 0,
        label: `Fill in ${placeholderBullets.length} blank${placeholderBullets.length === 1 ? "" : "s"} left in your bullets`,
        detail:
          "These read as an unfinished draft to anyone you send it to. Type the real numbers, or have them rewritten without one.",
      });
    }

    // ALWAYS present whenever there is a bullet to rewrite.
    //
    // The frameworks were previously reachable only three clicks deep in the
    // Editor tab, or inside the placeholder panel — which itself only exists
    // if the résumé happens to contain blanks. On a clean résumé there was
    // no way to reach CAR/STAR/PAR/SOAR/XYZ at all, and the user asked where
    // the option was twice. An opt-in feature nobody can find is not opt-in,
    // it is absent.
    const hasAnyBullet = sections.some(
      (sec) => sec.visible && sec.type === "work_experience" && sec.entries.some((e) => (e.bullets ?? []).some(Boolean)),
    );
    if (hasAnyBullet) {
      out.push({
        kind: "framework",
        points: 0,
        label: "Restructure a bullet with a proven framework",
        detail: "Google XYZ · CAR · PAR · STAR · SOAR — each tells you what it needs before writing anything.",
      });
    }

    // Bullet-level issues just focus the editor — free, instant, no call.
    for (const section of qualityAnalysis?.sections ?? []) {
      if (section.severity === "optional") continue;
      for (const issue of section.bulletIssues) {
        out.push({
          kind: "bullet",
          points: 0,
          label: issue.issueType,
          detail: `"${issue.originalText.slice(0, 70)}${issue.originalText.length > 70 ? "…" : ""}"`,
          company: section.entryCompany ?? "",
          bulletText: issue.originalText,
        });
      }
    }

    // Placeholders outrank other zero-point items: an unfinished-looking
    // document beats a merely weak one for urgency.
    const rank = (i: PlanItem) => (i.kind === "placeholder" ? 0.5 : 0);
    return out.sort((a, b) => b.points + rank(b) - (a.points + rank(a))).slice(0, 8);
  }, [style, sections, contact, scoreJump, qualityAnalysis, postingText]);

  if (items.length === 0) return null;

  function runInstantFix(): void {
    const { style: nextStyle, sections: nextSections, applied } = applyFormattingFixes(style, sections);
    if (applied.length === 0) return;
    onCommitSections(nextSections);
    if (nextStyle !== style) onCommitStyle(nextStyle);
    setAppliedNote(`Applied: ${applied.map((a) => a.label).join(" · ")}. Scores recalculated.`);
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">Action plan</p>
        <p className="text-[10px] text-text-muted">ranked by points it adds</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => {
          const key = `${item.kind}-${i}`;
          const running = isPending && activeKey === key;
          const isAi = item.kind === "keywords";

          return (
            <button
              key={key}
              type="button"
              disabled={isAi && isPending}
              onClick={() => {
                if (item.kind === "instant") return runInstantFix();
                if (item.kind === "placeholder") {
                  setShowFrameworks(false);
                  setShowPlaceholders((v) => !v);
                  return;
                }
                if (item.kind === "framework") {
                  setShowPlaceholders(false);
                  setShowFrameworks((v) => !v);
                  return;
                }
                if (item.kind === "bullet") return onFocusBullet(item.company, item.bulletText);
                if (item.kind === "keywords") {
                  setActiveKey(key);
                  return send(item.prompt);
                }
              }}
              className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  {running ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  ) : item.kind === "instant" ? (
                    <Zap className="h-3.5 w-3.5 text-success" />
                  ) : item.kind === "keywords" ? (
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                  ) : item.kind === "framework" ? (
                    <Layers className="h-3.5 w-3.5 text-accent" />
                  ) : item.kind === "placeholder" ? (
                    <PenLine className="h-3.5 w-3.5 text-warning" />
                  ) : item.kind === "profile" ? (
                    <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                  ) : (
                    <Target className="h-3.5 w-3.5 text-text-muted" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-text-primary">
                    {running ? "Rewriting…" : item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-muted">{item.detail}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {/* Cost is stated up front, because one of these spends a
                    ~25s AI call against the day's document_generation
                    allowance while the others cost nothing at all.
                    
                    This said "1 AI credit" briefly and that was wrong —
                    there IS no credit system here. Metering is per-action
                    DAILY caps (lib/usage.ts's DAILY_LIMITS, overridable per
                    plan), so the badge names the real unit.
                    
                    It briefly printed the cap too ("1 of 10/day") straight
                    from the constant — also wrong, because that constant is
                    only the fallback: a plan override, an unlimited null, or
                    the admin exemption all produce a different real number.
                    The live COUNT belongs to EditorUsageMeter, which now
                    resolves the limit the same way enforcement does; this
                    badge just states the cost. */}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    item.kind === "instant"
                      ? "bg-success/10 text-success"
                      : isAi
                        ? "bg-accent/10 text-accent"
                        : "bg-surface-secondary text-text-muted"
                  }`}
                >
                  {item.kind === "instant" ? "Instant" : isAi ? "Uses 1 rewrite" : "Free"}
                </span>
                {item.points > 0 && (
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] font-medium text-text-secondary">
                    +{item.points}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {showFrameworks && (
        <div className="mt-2">
          <FrameworkRewritePanel
            sections={sections}
            pending={isPending}
            onApply={(instruction) => {
              setShowFrameworks(false);
              send(instruction);
            }}
            onClose={() => setShowFrameworks(false)}
          />
        </div>
      )}

      {showPlaceholders && placeholderBullets.length > 0 && (
        <div className="mt-2">
          <PlaceholderFixPanel
            bullets={placeholderBullets}
            pending={isPending}
            onApply={(instruction) => {
              setShowPlaceholders(false);
              send(instruction);
            }}
            onClose={() => setShowPlaceholders(false)}
          />
        </div>
      )}

      {appliedNote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-success/30 bg-success/5 px-2.5 py-2 text-[11px] text-success">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{appliedNote}</span>
        </p>
      )}

      {/* In the résumé workspace, errors, limits and the AI's reply all land
          in the shared chat thread pinned under this panel (one place, one
          modal); these inline copies are for standalone use only. */}
      {error && !isShared && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/5 px-2.5 py-2 text-[11px] text-error">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {/* A cap is a product state, not an error. Same modal search, email
          lookup and insider connections already use — this surface was the
          odd one out, showing a red line where everything else offers a
          real upgrade path. */}
      {limit && !isShared && (
        <LimitReachedModal
          reason={limit.reason}
          featureLabel="résumé rewrites"
          message={limit.message}
          resetsAt={limit.resetsAt}
          canUpgrade={limit.canUpgrade}
          onClose={clearLimit}
        />
      )}

      {/* The assistant's own words, verbatim. When it declines to add a
          skill it now proposes a draft bullet instead of asking the user to
          go find information, and that draft is the entire value of the
          reply — summarising it away was the bug. */}
      {/* The canonical agent surface, not a hand-rolled one. ui-tokens.md's
          Agent invariant is strict — anything the AI produced carries this
          treatment and nothing else ever does — and AiReadsCard's own header
          records that ~24 files each re-implementing the flat callout by
          hand is exactly what it exists to replace. "compact" is the right
          tier here: AI output nested inside an already-dense card. */}
      {justUpdated && !error && lastReply && !isShared && (
        <div className="mt-2">
          <AiReadsCard label="What changed" variant="compact">
            <p className="whitespace-pre-wrap text-[11px] leading-snug">{lastReply}</p>
            <p className="mt-1.5 text-[11px] opacity-80">
              Anything offered as a draft is not in your résumé yet — reply in the chat below to confirm it&apos;s true
              and it gets added.
            </p>
          </AiReadsCard>
        </div>
      )}
    </div>
  );
}
