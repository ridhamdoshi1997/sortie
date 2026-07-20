"use client";

import { useState, useTransition } from "react";
import { Palette } from "lucide-react";

import { setPreferredResumeTheme } from "@/actions/profile";
import type { ResumeTheme } from "@/app/api/resume/generate/ResumePDF";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const THEME_LABELS: Record<ResumeTheme, string> = {
  modern: "Modern",
  classic: "Classic",
  minimal: "Minimal",
};

type Props = {
  value: ResumeTheme;
};

// Persists to profiles.preferred_resume_theme — every document route (resume
// generation, cover letter generation/revision) reads that column fresh per
// request and applies it to both ResumePDF.tsx and CoverLetterPDF.tsx, so
// this selector doesn't need to pass the choice down as a prop to anything
// else. All three themes are equally ATS-safe (single column, no
// tables/images, standard-14 PDF fonts) — this only changes look and feel.
//
// Uses the custom Select (components/ui/select.tsx, built on @base-ui/react)
// instead of a native <select> — see ModelSelector.tsx for why.
export function ThemeSelector({ value }: Props) {
  const [selected, setSelected] = useState<ResumeTheme>(value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: ResumeTheme) {
    const previous = selected;
    setSelected(next);
    setError(null);

    startTransition(async () => {
      const result = await setPreferredResumeTheme(next);
      if (!result.success) {
        setSelected(previous);
        setError(result.error ?? "Failed to save theme preference");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Palette className="h-4 w-4 text-muted-foreground" aria-hidden />
      <label id="theme-selector-label" className="text-muted-foreground">
        Resume theme
      </label>
      <Select
        value={selected}
        disabled={isPending}
        onValueChange={(next) => handleChange(next as ResumeTheme)}
      >
        <SelectTrigger aria-labelledby="theme-selector-label">
          <SelectValue>{(v: ResumeTheme) => THEME_LABELS[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(THEME_LABELS) as ResumeTheme[]).map((theme) => (
            <SelectItem key={theme} value={theme}>
              {THEME_LABELS[theme]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
