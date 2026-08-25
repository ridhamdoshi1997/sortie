"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";

import { useToast } from "@/components/ui/ToastProvider";

const STORAGE_KEY = "sortie_compare_jobs";
const MAX_COMPARE = 3;

type CompareEntry = { id: string; title: string; company: string };

function readCompareSet(): CompareEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompareEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCompareSet(entries: CompareEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore — this is a nice-to-have, never load-bearing
  }
}

// Job comparison view (build-plan.md §H) — deliberately scoped as a
// self-contained addition to just the job detail page rather than touching
// MissionsView.tsx's already-complex filter/sort/view-mode state, to keep
// regression risk on a heavily-used page at zero. The compare set lives in
// localStorage, capped at 3 (a real side-by-side table stops being
// scannable past that), and the actual comparison renders on `/compare`.
export function AddToCompareButton({ jobId, title, company }: { jobId: string; title: string; company: string }) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<CompareEntry[]>([]);

  // Deferred via setTimeout(0) — same reason as every other mount-effect
  // setState in this project (e.g. DocumentGenerator.tsx's deep-link
  // effect): react-hooks/set-state-in-effect flags a direct synchronous
  // call, since localStorage is only readable client-side after mount.
  useEffect(() => {
    const timer = setTimeout(() => setEntries(readCompareSet()), 0);
    return () => clearTimeout(timer);
  }, []);

  const isAdded = entries.some((e) => e.id === jobId);
  const atCap = entries.length >= MAX_COMPARE && !isAdded;

  function toggle(): void {
    const next = isAdded ? entries.filter((e) => e.id !== jobId) : [...entries, { id: jobId, title, company }].slice(0, MAX_COMPARE);
    setEntries(next);
    writeCompareSet(next);
    showToast(isAdded ? `Removed "${title}" from comparison` : `Added "${title}" to comparison`, "success");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={atCap}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isAdded ? "border-accent bg-accent-muted text-accent" : "border-border text-text-secondary hover:bg-surface-secondary"
        }`}
        title={atCap ? `You can compare up to ${MAX_COMPARE} jobs at once` : undefined}
      >
        <Scale className="h-4 w-4" />
        {isAdded ? "Added to compare" : "Add to compare"}
      </button>

      {entries.length >= 2 && (
        <Link
          href={`/compare?ids=${entries.map((e) => e.id).join(",")}`}
          className="btn-signal inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-accent-foreground"
        >
          Compare {entries.length} jobs
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
