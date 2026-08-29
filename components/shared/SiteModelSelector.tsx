"use client";

import { useEffect, useState, useTransition } from "react";
import { Cpu } from "lucide-react";

import { getModelSelectorState, setPreferredModel } from "@/actions/profile";
import { MODEL_IDS, type ModelProvider, type ModelTier } from "@/lib/models";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const PROVIDER_NAMES: Record<ModelProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};

const PROVIDERS = Object.keys(PROVIDER_NAMES) as ModelProvider[];
const TIERS: ModelTier[] = ["smart", "fast"];

function optionKey(provider: ModelProvider, tier: ModelTier): string {
  return `${provider}:${tier}`;
}

function optionLabel(provider: ModelProvider, tier: ModelTier): string {
  return `${PROVIDER_NAMES[provider]} · ${MODEL_IDS[provider][tier]} (${tier})`;
}

// Site-wide model picker, direct user request 2026-08-29: "admin, owners
// and some testers can get full model things and they also get the model
// selector option site wide" — later extended the same day: "admin,
// testers and owners can also see the fast tier models as well in the
// picking list", so this shows all 6 provider x tier combinations, not
// just each provider's smart model — letting a full-access user
// deliberately preview what a free/Recon user's actual "fast" tier
// experience looks like on a given provider. Self-fetching
// (getModelSelectorState on mount) rather than threaded through Navbar's
// props — same "self-contained client component, no auth plumbing through
// the parent" pattern GlobalSearchBar.tsx already established for a
// site-wide component. Renders nothing at all for an ineligible user — not
// a disabled control, not a locked-with-upsell state, since this is an
// internal/tester capability, not a feature paying users are meant to
// discover and want.
//
// Mounted inline in Navbar.tsx's desktop icon row (next to Notifications/
// ThemeToggle), NOT as a fixed-position floating element — the obvious
// bottom-right spot is already owned by NavigatorLauncher's FAB
// (components/agent/NavigatorLauncher.tsx, fixed bottom-6 right-6) and its
// expanded chat panel, so a second floating control there would overlap it.
export function SiteModelSelector() {
  const [eligible, setEligible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string>(optionKey("gemini", "smart"));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getModelSelectorState()
      .then((state) => {
        if (cancelled) return;
        setEligible(state.eligible);
        setSelected(optionKey(state.current, state.currentTier ?? "smart"));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !eligible) return null;

  function handleChange(next: string) {
    const previous = selected;
    setSelected(next);
    setError(null);

    const [provider, tier] = next.split(":") as [ModelProvider, ModelTier];
    startTransition(async () => {
      const result = await setPreferredModel(provider, tier);
      if (!result.success) {
        setSelected(previous);
        setError(result.error ?? "Failed to save model preference");
      }
    });
  }

  return (
    <div className="hidden items-center sm:flex" title={error ?? undefined}>
      <label id="site-model-selector-label" className="sr-only">
        AI model
      </label>
      <Select value={selected} disabled={isPending} onValueChange={(next) => handleChange(next as string)}>
        <SelectTrigger
          aria-labelledby="site-model-selector-label"
          className="h-auto border-none bg-transparent p-0 text-overlay-foreground/60 shadow-none transition-colors duration-200 ease-in-out hover:text-overlay-foreground [&_svg:not(:first-child)]:h-3 [&_svg:not(:first-child)]:w-3"
        >
          <Cpu className="h-5 w-5" aria-hidden />
        </SelectTrigger>
        <SelectContent>
          {PROVIDERS.map((provider) =>
            TIERS.map((tier) => (
              <SelectItem key={optionKey(provider, tier)} value={optionKey(provider, tier)}>
                {optionLabel(provider, tier)}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
