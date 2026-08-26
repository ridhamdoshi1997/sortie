import { Briefcase, Calculator, Code2, FileSearch, MessageSquareText, Target } from "lucide-react";

// New section (2026-08-26, direct user request) — the homepage described the
// 10-dimension evaluator, résumé tailoring, insider connections, tracking,
// and interview prep in broad strokes (BentoFeatures.tsx/TheLifecycle.tsx),
// but several genuinely shipped, differentiated tools had no mention at
// all: the interview page's own AI question bank/live code editor/STAR
// story builder (just redesigned this session — see /interview), company
// research dossiers, and the offer/negotiation toolkit. Every line below
// describes something this app actually does today — no placeholder or
// aspirational items, same discipline as BentoFeatures.tsx's own header
// comment.
const TOOLS = [
  {
    icon: MessageSquareText,
    title: "AI Interview Question Bank",
    description:
      "Predicted questions for any company you're prepping for, organized by category — technical, system design, behavioral, culture fit.",
  },
  {
    icon: Code2,
    title: "Live In-Browser Code Editor",
    description:
      "Practice technical questions in a real sandbox — multiple languages, AI-generated test cases, graded pass/fail, nothing you type ever leaves your browser.",
  },
  {
    icon: Target,
    title: "Reusable STAR Stories",
    description:
      "Write your best behavioral stories once. Reuse and adapt them across every question that fits, instead of improvising from scratch each time.",
  },
  {
    icon: FileSearch,
    title: "Company Research Dossiers",
    description:
      "Culture, tech stack, leadership, and smart questions to ask — researched automatically for every job, not a manual Google-and-guess.",
  },
  {
    icon: Calculator,
    title: "Offer & Negotiation Toolkit",
    description:
      "An equity decoder, a real take-home tax estimator, and AI-drafted negotiation scripts grounded in your actual leverage, not generic advice.",
  },
  {
    icon: Briefcase,
    title: "Weekly AI Briefing",
    description:
      "A short, honest read on your search every week — what moved, what stalled, what to do next. No vanity metrics.",
  },
];

export function FullToolkit() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-accent">
            The full toolkit
          </p>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary">
            Every stage, covered — not just the search
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.title}
                className="fade-in-up card-interactive-glow rounded-2xl border border-border bg-surface p-6 shadow-card"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-agent-light">
                  <Icon className="h-4.5 w-4.5 text-agent-dark" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">{tool.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-text-secondary">{tool.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
