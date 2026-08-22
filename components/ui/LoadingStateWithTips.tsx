"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export type LoadingTip = { title: string; body: string };

type Props = {
  statusText: string;
  timeEstimate: string;
  tips: LoadingTip[];
};

// Real implementation of app/preview/page.tsx's DemoLoadingState mockup
// ("teaches a feature instead of showing a blank spinner") — distinct from
// GenerationProgress (components/ui/GenerationProgress.tsx), which is for
// single-artifact generations with a visible usage-remaining cost. This is
// specifically for longer, higher-stakes waits (a real search + AI
// evaluation batch) where rotating in something genuinely true about the
// app is worth more than a usage count. Tips cycle automatically but stay
// user-clickable via the dot pagination, same as the mockup.
export function LoadingStateWithTips({ statusText, timeEstimate, tips }: Props) {
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return;
    const timer = setInterval(() => {
      setTip((i) => (i + 1) % tips.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [tips.length]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-card">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div className="w-full">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div className="generation-progress-fill h-full rounded-full bg-accent transition-all duration-700" />
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary">{statusText}</p>
          <p className="text-xs text-text-muted">{timeEstimate}</p>
        </div>

        <div className="w-full rounded-xl border border-border bg-surface-secondary p-5 text-left">
          <p className="font-mono text-[10px] uppercase tracking-wider text-accent">While you wait</p>
          <h4 className="mt-2 text-sm font-semibold text-text-primary">{tips[tip].title}</h4>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{tips[tip].body}</p>
          <div className="mt-4 flex gap-1.5">
            {tips.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTip(i)}
                aria-label={`Tip ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === tip ? "w-6 bg-accent" : "w-1.5 bg-border"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
