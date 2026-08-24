"use client";

import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Radar as RadarIcon } from "lucide-react";

import { getMatchedSkills } from "@/actions/skillGapTracking";
import type { SkillGap } from "@/lib/skillGapTracking";

// Skills radar chart (build-plan.md §H) — real strengths, not a
// self-reported list: how often each skill showed up as a genuine MATCH
// across the user's own evaluated jobs (lib/evaluator.ts's matched_skills),
// same zero-AI aggregation shape as SkillGapTracker's missing-skills
// counterpart. recharts is already a dependency (AnalyticsCharts.tsx) — no
// new package needed.
export function SkillsRadarChart() {
  const [skills, setSkills] = useState<SkillGap[] | null>(null);

  useEffect(() => {
    getMatchedSkills().then((result) => {
      if (result.success) setSkills(result.gaps);
    });
  }, []);

  if (skills !== null && skills.length < 3) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <RadarIcon className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Your Skill Strengths</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Skills that keep showing up as a genuine match across your own evaluated jobs — real matched counts, not a
        self-reported list.
      </p>

      {skills === null ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={skills} outerRadius="75%">
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis dataKey="skill" tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }} />
              <Radar dataKey="count" stroke="var(--color-agent)" fill="var(--color-agent)" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
