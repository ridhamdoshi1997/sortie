import type { Education, WorkExperience } from "@/types";

// Real, free, honest network signal: did the candidate previously work at
// the exact company now hiring? Nothing fabricated — see
// components/shared/NetworkSignals.tsx for why this replaced a fake headcount.
export function findPreviousEmployerMatch(
  company: string | null,
  workExperience: WorkExperience[] | null,
): { employer: string } | null {
  if (!company || !workExperience) return null;

  const normalizedCompany = company.trim().toLowerCase();
  const match = workExperience.find(
    (entry) => entry.company?.trim().toLowerCase() === normalizedCompany,
  );

  return match ? { employer: match.company } : null;
}

export function buildNetworkSearchTerms(
  workExperience: WorkExperience[] | null,
  education: Education[] | null,
): string[] {
  const employers = (workExperience ?? []).map((entry) => entry.company).filter(Boolean);
  const schools = (education ?? [])
    .map((entry) => entry.institution)
    .filter((institution): institution is string => !!institution);

  return Array.from(new Set([...employers, ...schools]));
}
