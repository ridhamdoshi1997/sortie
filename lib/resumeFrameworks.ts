// Résumé bullet frameworks, offered as an explicit OPT-IN (Phase 53).
//
// Direct user instruction: "make options for user to apply the google xyz
// method — if user agrees then explain what needed and then user feeds the
// data and then you will apply the xyz method. Remove the by-default
// techniques."
//
// The reason this exists is the placeholder failure. XYZ was applied to
// EVERY bullet automatically, and because a framework demands inputs the
// résumé does not contain, the model filled the gaps with "[X]%" and shipped
// a document full of blanks. A framework is only useful once someone has the
// data it needs — so the flow is now: pick one, see exactly what it asks
// for, answer those questions, THEN it gets applied.
//
// Researched 2026-09-11 (agy) against university career centres (MIT,
// Rutgers, Arizona) and industry career services. Each entry's `bestFor` and
// `weakness` are the real documented tradeoffs, not marketing copy — a user
// choosing a framework should be able to see why it might be wrong for them.

export type FrameworkId = "xyz" | "car" | "par" | "star" | "soar";

export type FrameworkQuestion = {
  id: string;
  /** The letter this answer fills. */
  slot: string;
  label: string;
  placeholder: string;
};

export type ResumeFramework = {
  id: FrameworkId;
  name: string;
  expansion: string;
  summary: string;
  bestFor: string;
  weakness: string;
  example: string;
  questions: FrameworkQuestion[];
  /** Appended to the system prompt when this framework is applied. */
  instruction: string;
};

export const RESUME_FRAMEWORKS: ResumeFramework[] = [
  {
    id: "xyz",
    name: "Google XYZ",
    expansion: "Accomplished X, as measured by Y, by doing Z",
    summary: "Leads with the result, backs it with a number, then says how. The most widely-cited modern format.",
    bestFor: "Almost any role where you can attach a real number to the outcome.",
    weakness: "Falls apart without a metric — which is exactly how it produced bracketed blanks before.",
    example:
      "Cut average deployment time from 40 minutes to 6 by replacing the manual release checklist with an automated CI/CD pipeline.",
    questions: [
      { id: "x", slot: "X", label: "What was the accomplishment?", placeholder: "Cut deployment time" },
      { id: "y", slot: "Y", label: "What number proves it? (before → after, %, $, count)", placeholder: "40 minutes → 6 minutes" },
      { id: "z", slot: "Z", label: "How did you do it?", placeholder: "Automated the release pipeline in Azure DevOps" },
    ],
    instruction:
      "Apply Google's XYZ formula: lead with the accomplishment, support it with the measurement the candidate supplied, then state the method. Use the candidate's supplied numbers EXACTLY as given — never round, extrapolate or embellish them.",
  },
  {
    id: "car",
    name: "CAR",
    expansion: "Challenge → Action → Result",
    summary: "Frames you as the person who fixed something broken. The industry workhorse.",
    bestFor: "Mid-level roles, operations, IT, consulting, and any turnaround where fixing a broken process was the value.",
    weakness: "Needs a real problem to have existed. Awkward for greenfield work or maintaining something already healthy.",
    example:
      "Resolved a 20% drop in user retention by redesigning the onboarding email sequence, lifting subscription renewals 15% in six months.",
    questions: [
      { id: "c", slot: "C", label: "What was broken or difficult?", placeholder: "User retention had dropped 20%" },
      { id: "a", slot: "A", label: "What did YOU do about it?", placeholder: "Redesigned the onboarding email sequence" },
      { id: "r", slot: "R", label: "What changed as a result?", placeholder: "Renewals up 15% within six months" },
    ],
    instruction:
      "Apply the CAR framework: open with the challenge, state the candidate's own action, close on the result. Keep the challenge framed as context, never as blame toward a previous employer.",
  },
  {
    id: "par",
    name: "PAR",
    expansion: "Problem → Action → Result",
    summary: "A tighter, punchier CAR. Best when space is at a premium.",
    bestFor: "Strict one-page résumés, customer service, sales, and engineering with clear cause-and-effect.",
    weakness: "Can read as negative if the problem dwells on company dysfunction rather than your improvement.",
    example:
      "Eliminated recurring API timeout errors by refactoring legacy backend endpoints, raising uptime from 96% to 99.9%.",
    questions: [
      { id: "p", slot: "P", label: "What specific problem existed?", placeholder: "Frequent API timeout errors" },
      { id: "a", slot: "A", label: "What did you do?", placeholder: "Refactored the legacy endpoints" },
      { id: "r", slot: "R", label: "What was the measurable impact?", placeholder: "Uptime 96% → 99.9%" },
    ],
    instruction:
      "Apply the PAR framework as tightly as possible — one line if you can. Lead with the problem, then the intervention, then the impact. Prefer the shortest phrasing that keeps all three.",
  },
  {
    id: "star",
    name: "STAR",
    expansion: "Situation → Task → Action → Result",
    summary: "Adds context before the action. Borrowed from behavioural interviews.",
    bestFor: "Complex projects, structured corporate environments, and early-career candidates executing assigned work.",
    weakness: "Prone to becoming wordy — four elements rarely fit one résumé line without turning into a paragraph.",
    example:
      "During rapid team expansion, tasked with standardising onboarding, built an automated training module that cut ramp-up time by two weeks.",
    questions: [
      { id: "s", slot: "S", label: "What was the situation or context?", placeholder: "Team was doubling in six months" },
      { id: "t", slot: "T", label: "What were YOU specifically responsible for?", placeholder: "Standardising how new hires were trained" },
      { id: "a", slot: "A", label: "What did you do?", placeholder: "Built an automated onboarding module" },
      { id: "r", slot: "R", label: "What was the outcome?", placeholder: "Ramp-up time down by two weeks" },
    ],
    instruction:
      "Apply the STAR framework, but compress ruthlessly — a résumé bullet is one or two lines, not a paragraph. If all four elements will not fit, merge Situation and Task into a single opening clause rather than dropping the Result.",
  },
  {
    id: "soar",
    name: "SOAR",
    expansion: "Situation → Obstacle/Objective → Action → Result",
    summary: "STAR's strategic upgrade — positions you as someone who sets direction, not someone who completes tasks.",
    bestFor: "Director, VP and C-suite roles where strategic autonomy is the thing being assessed.",
    weakness: "Sounds pretentious on entry-level or junior roles that genuinely lacked strategic ownership.",
    example:
      "Facing stagnant EMEA market share, with an objective of winning enterprise accounts, launched a localised partnership programme generating $2.4M new ARR in year one.",
    questions: [
      { id: "s", slot: "S", label: "What was the business or market context?", placeholder: "EMEA market share had stalled" },
      { id: "o", slot: "O", label: "What was the strategic objective or obstacle?", placeholder: "Break into enterprise accounts" },
      { id: "a", slot: "A", label: "What did you drive?", placeholder: "Launched a localised B2B partnership programme" },
      { id: "r", slot: "R", label: "What was the business impact?", placeholder: "$2.4M new ARR in the first year" },
    ],
    instruction:
      "Apply the SOAR framework with an executive register: lead on business context and strategic objective, then the candidate's own leadership action, and close on quantified business impact.",
  },
];

export function getFramework(id: string): ResumeFramework | undefined {
  return RESUME_FRAMEWORKS.find((f) => f.id === id);
}

/**
 * Builds the instruction sent to the model once the user has answered.
 *
 * The answers are the ONLY new facts introduced. The no-fabrication rule is
 * restated here rather than left to the shared prompt, because a framework
 * explicitly asks for a metric and that is precisely the moment a model is
 * most tempted to supply one the candidate never gave.
 */
export function buildFrameworkPrompt(
  framework: ResumeFramework,
  bulletText: string,
  answers: Record<string, string>,
): string {
  const supplied = framework.questions
    .map((q) => {
      const value = (answers[q.id] ?? "").trim();
      return value ? `- ${q.slot} (${q.label}) ${value}` : null;
    })
    .filter(Boolean)
    .join("\n");

  return [
    `Rewrite this résumé bullet using the ${framework.name} framework (${framework.expansion}).`,
    "",
    `ORIGINAL BULLET: "${bulletText}"`,
    "",
    "WHAT I SUPPLIED — these are the only new facts you may use:",
    supplied || "(nothing supplied — see the rule below)",
    "",
    framework.instruction,
    "",
    "HARD RULES:",
    "- Use my answers exactly as written. Do not round, scale, extrapolate or embellish any number I gave you.",
    "- Do not invent anything I did not supply. If I left a slot blank, write the bullet without that element rather than guessing at it.",
    "- Never output a placeholder like [X] or [add metric]. If a number is missing, write a strong bullet that does not need one.",
    "- Return the rewritten bullet only, and tell me which of my answers you used where.",
  ].join("\n");
}
