"use client";

import { useState, useTransition } from "react";
import { Cpu } from "lucide-react";

import { setPreferredModel } from "@/actions/profile";
import { MODEL_IDS, type ModelProvider } from "@/lib/models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROVIDER_NAMES: Record<ModelProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};

// Document generation always runs at the "smart" tier, so that's the version
// actually invoked when this provider is selected — shown alongside the name
// so the choice isn't just a brand label with no indication of which model.
function providerLabel(provider: ModelProvider): string {
  return `${PROVIDER_NAMES[provider]} · ${MODEL_IDS[provider].smart}`;
}

type Props = {
  value: ModelProvider;
};

// Persists to profiles.preferred_model — every AI route (research, document
// generation/revision, resume generation) reads that column fresh per
// request, so this selector doesn't need to pass the choice down as a prop
// to anything else. Not wired into Find Jobs' match-scoring pipeline —
// lib/evaluator.ts is a separate, still-hardcoded-Gemini call site slated
// for full replacement in Phase 9, not migrated here.
//
// Uses the custom Select (components/ui/select.tsx, built on @base-ui/react)
// instead of a native <select> — the browser's native option-list highlight
// color can't be restyled to the app's amber accent (confirmed: neither
// CSS `color-scheme` nor `accent-color` changes it in Chromium), so a real
// popup is the only way to get an on-brand highlighted-option color.
export function ModelSelector({ value }: Props) {
  const [selected, setSelected] = useState<ModelProvider>(value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: ModelProvider) {
    const previous = selected;
    setSelected(next);
    setError(null);

    startTransition(async () => {
      const result = await setPreferredModel(next);
      if (!result.success) {
        setSelected(previous);
        setError(result.error ?? "Failed to save model preference");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Cpu className="h-4 w-4 text-muted-foreground" aria-hidden />
      <label id="model-selector-label" className="text-muted-foreground">
        Model
      </label>
      <Select
        value={selected}
        disabled={isPending}
        onValueChange={(next) => handleChange(next as ModelProvider)}
      >
        <SelectTrigger aria-labelledby="model-selector-label">
          <SelectValue>{(v: ModelProvider) => providerLabel(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PROVIDER_NAMES) as ModelProvider[]).map((provider) => (
            <SelectItem key={provider} value={provider}>
              {providerLabel(provider)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
