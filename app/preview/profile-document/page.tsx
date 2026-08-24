"use client";

/**
 * DESIGN PREVIEW — profile page redesign, "Interactive Document" direction.
 * No tabs — the whole profile reads as one polished document; hovering a
 * block reveals an edit affordance, clicking transitions it into inline edit
 * mode in place (no modal). Placeholder data only, not wired to anything.
 * See /preview/profile for the "Command Center" direction and /preview/
 * profile-split for "Split-View Canvas" — three directions considered for
 * the same redesign, discussed in chat.
 */

import { useState } from "react";
import { Pencil, Sparkles } from "lucide-react";

function SectionLabel({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        {children}
      </h2>
      {note && <span className="text-xs text-text-muted">{note}</span>}
    </div>
  );
}

/** A block of the document that reveals an edit affordance on hover and
 * expands into inline inputs in place when active — the defining trait of
 * this direction, and its main engineering cost (state + layout-shift
 * handling per block, multiplied by every block on the page). */
function DocBlock({
  id,
  activeId,
  onActivate,
  onDeactivate,
  readView,
  editView,
}: {
  id: string;
  activeId: string | null;
  onActivate: (id: string) => void;
  onDeactivate: () => void;
  readView: React.ReactNode;
  editView: React.ReactNode;
}) {
  const isActive = activeId === id;
  return (
    <div
      className={`group relative rounded-xl px-4 py-3 transition-colors ${
        isActive ? "bg-surface-secondary ring-1 ring-accent" : "hover:bg-surface-secondary"
      }`}
    >
      {!isActive && (
        <button
          type="button"
          onClick={() => onActivate(id)}
          aria-label="Edit this section"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-accent opacity-0 transition-opacity hover:bg-accent-muted group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {isActive ? (
        <div>
          {editView}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        readView
      )}
    </div>
  );
}

export default function ProfileDocumentPreviewPage() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          Sortie · Design preview
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
          Profile — &ldquo;Interactive Document&rdquo; direction
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          No tabs, no modal — hover a block to reveal edit, click to expand it in place. Most
          novel feel of the three, but the highest engineering cost (state + layout-shift per
          block).{" "}
          <a href="/preview/profile" className="text-accent hover:underline">
            ← Command Center
          </a>{" "}
          ·{" "}
          <a href="/preview/profile-split" className="text-accent hover:underline">
            Split-View Canvas →
          </a>
        </p>
      </header>

      <section>
        <SectionLabel note="hover any block below, then click to edit in place">Profile</SectionLabel>

        <div className="rounded-2xl border border-border bg-surface p-2 shadow-card">
          <DocBlock
            id="header"
            activeId={activeId}
            onActivate={setActiveId}
            onDeactivate={() => setActiveId(null)}
            readView={
              <div>
                <h2 className="text-xl font-bold text-text-primary">Ridham Doshi</h2>
                <p className="text-sm text-text-secondary">
                  Software Developer · Windsor, Ontario, Canada · 226-506-8168
                </p>
              </div>
            }
            editView={
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  defaultValue="Ridham Doshi"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  defaultValue="226-506-8168"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            }
          />

          <div className="my-1 border-t border-border" />

          <DocBlock
            id="summary"
            activeId={activeId}
            onActivate={setActiveId}
            onDeactivate={() => setActiveId(null)}
            readView={
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Summary
                </p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Software Engineer with two years in the IT industry, focused on product design
                  and .NET-based development.{" "}
                  <span className="rounded bg-agent-light px-1 py-0.5 text-xs font-medium text-agent-dark">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    AI suggestion available
                  </span>
                </p>
              </div>
            }
            editView={
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Summary
                </p>
                <textarea
                  rows={3}
                  defaultValue="Software Engineer with two years in the IT industry, focused on product design and .NET-based development."
                  className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-agent-light px-3 py-2 text-xs leading-5 text-agent-dark">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  AI-generated content is always marked teal, never amber — even inline, editing
                  affordances stay visually distinct from AI output.
                </p>
              </div>
            }
          />

          <div className="my-1 border-t border-border" />

          <DocBlock
            id="work-1"
            activeId={activeId}
            onActivate={setActiveId}
            onDeactivate={() => setActiveId(null)}
            readView={
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Work Experience
                </p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  Meridian Credit Union — Software Developer
                </p>
                <p className="text-xs text-text-muted">2022-08 → Present</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Led migration of corporate applications to scalable cloud architecture on
                  modern .NET frameworks.
                </p>
              </div>
            }
            editView={
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Work Experience
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    defaultValue="Software Developer"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                  <input
                    defaultValue="Meridian Credit Union"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                </div>
                <textarea
                  rows={2}
                  defaultValue="Led migration of corporate applications to scalable cloud architecture on modern .NET frameworks."
                  className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                />
                <p className="text-[11px] text-text-muted">
                  Multiple roles/degrees would each need their own DocBlock — this is where the
                  &ldquo;visually chaotic with several open at once&rdquo; risk shows up.
                </p>
              </div>
            }
          />

          <div className="my-1 border-t border-border" />

          <DocBlock
            id="skills"
            activeId={activeId}
            onActivate={setActiveId}
            onDeactivate={() => setActiveId(null)}
            readView={
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Skills
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["Azure DevOps", ".NET / ASP.NET", "Angular", "Docker", "SQL"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-accent-muted px-2.5 py-1 text-xs font-medium text-accent"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            }
            editView={
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Skills
                </p>
                <input
                  placeholder="Add a skill and press Enter"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                />
              </div>
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-surface-secondary p-5">
        <p className="text-sm font-medium text-text-primary">Why this is the highest-risk option</p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">
          Every block above manages its own active/inactive state independently — nothing stops a
          user from having several open at once (try clicking two blocks in a row here), which is
          exactly the &ldquo;visually chaotic, hard to manage state&rdquo; con Gemini flagged. A real
          build would need either a single-block-open constraint or real height-animation work to
          avoid layout jumping — neither exists in this preview.
        </p>
      </section>
    </main>
  );
}
