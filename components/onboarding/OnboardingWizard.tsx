"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Upload, X } from "lucide-react";

import { extractProfile, uploadResume, type ExtractedProfile } from "@/actions/profile";
import { completeOnboarding } from "@/actions/onboarding";

const CATEGORIES = [
  "Software / Internet / AI",
  "Data & Analytics",
  "Product",
  "Design",
  "Finance",
  "Marketing",
  "Operations",
  "Healthcare",
];

const ROLE_GROUPS: Record<string, { group: string; roles: string[] }[]> = {
  "Software / Internet / AI": [
    {
      group: "Backend & Platform",
      roles: [".NET Engineer", "Backend Engineer", "Platform Engineer", "Full Stack Engineer"],
    },
    {
      group: "Frontend / Mobile",
      roles: ["Frontend Engineer", "React Developer", "iOS Developer", "Android Developer"],
    },
    {
      group: "Reliability & Security",
      roles: ["DevOps Engineer", "Cloud Engineer", "Security Engineer", "SRE"],
    },
  ],
};

const WORK_AUTH_OPTIONS = ["Citizen / PR", "Work permit", "Needs sponsorship", "Prefer not to say"];

// Matches the exact experience_level enum this app's evaluator/extractor
// already uses elsewhere (actions/profile.ts's ExtractedProfile schema) —
// not the mockup's own looser 4-band labels, so onboarding writes a value
// every other feature already knows how to read.
const EXPERIENCE_LEVELS = ["Junior", "Mid-Level", "Senior", "Lead", "Manager", "Director", "Executive"];

const SOURCES = [
  "Google search",
  "LinkedIn (job posting)",
  "LinkedIn (someone's post)",
  "YouTube",
  "TikTok",
  "Instagram",
  "Friend or colleague",
  "AI tools (like ChatGPT)",
  "Other",
];

function StepShell({
  step,
  total,
  question,
  children,
}: {
  step: number;
  total: number;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col justify-between gap-8 border-b border-border bg-surface-secondary p-8 lg:border-b-0 lg:border-r">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              S
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
              Sortie · setup
            </span>
          </div>
          <h2 className="mt-6 text-2xl font-bold leading-tight text-text-primary">{question}</h2>
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < step ? "w-8 bg-accent" : "w-4 bg-border"
              }`}
            />
          ))}
          <span className="ml-2 font-mono text-[11px] text-text-muted">
            {step} / {total}
          </span>
        </div>
      </div>

      <div className="p-8">{children}</div>
    </div>
  );
}

type WizardState = {
  selectedRoles: string[];
  workAuth: string | null;
  experienceLevel: string | null;
  acquisitionChannel: string | null;
  extracted: ExtractedProfile | null;
  resumeUploaded: boolean;
};

function StepRoles({
  state,
  setState,
  onNext,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onNext: () => void;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);

  function toggleRole(role: string): void {
    setState((prev) => ({
      ...prev,
      selectedRoles: prev.selectedRoles.includes(role)
        ? prev.selectedRoles.filter((r) => r !== role)
        : [...prev.selectedRoles, role],
    }));
  }

  return (
    <StepShell step={1} total={3} question="What kind of role are you looking for?">
      <div className="flex flex-col gap-5">
        {state.selectedRoles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.selectedRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent"
              >
                {role}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                  c === category
                    ? "bg-accent-muted font-medium text-accent"
                    : "text-text-secondary hover:bg-surface-secondary"
                }`}
              >
                {c}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </button>
            ))}
          </div>

          <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-xl border border-border p-3">
            {(ROLE_GROUPS[category] ?? []).map((g) => (
              <div key={g.group}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {g.group}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.roles.map((role) => {
                    const on = state.selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          on
                            ? "border-transparent bg-accent-muted text-accent"
                            : "border-border text-text-secondary hover:border-accent hover:text-accent"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!ROLE_GROUPS[category] && (
              <p className="text-sm text-text-muted">Roles for {category} would appear here.</p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">Work authorization</label>
          <div className="flex flex-wrap gap-2">
            {WORK_AUTH_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, workAuth: w }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  state.workAuth === w
                    ? "border-transparent bg-accent-muted text-accent"
                    : "border-border text-text-secondary hover:border-accent hover:text-accent"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Used for the visa/work-authorization dimension — never shared.
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="btn-signal inline-flex min-h-11 w-fit items-center justify-center rounded-lg px-6 text-sm font-medium text-accent-foreground"
        >
          Continue
        </button>
      </div>
    </StepShell>
  );
}

function StepUpload({
  state,
  setState,
  onNext,
  onBack,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [isExtracting, startExtract] = useTransition();

  function handleFile(file: File): void {
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are accepted.");
      return;
    }
    setUploadError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("resume", file);

    startUpload(async () => {
      const result = await uploadResume(formData);
      if (result.success) {
        setState((prev) => ({ ...prev, resumeUploaded: true }));
      } else {
        setUploadError(result.error ?? "Upload failed");
      }
    });
  }

  function handleExtract(): void {
    setExtractError(null);
    startExtract(async () => {
      const result = await extractProfile();
      if (result.success && result.data) {
        setState((prev) => ({ ...prev, extracted: result.data! }));
      } else {
        setExtractError(result.error ?? "Extraction failed");
      }
    });
  }

  return (
    <StepShell step={2} total={3} question="Add your resume so we can grade jobs against it.">
      <div className="flex flex-col gap-5">
        {state.resumeUploaded ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary p-4">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-lightest text-success-foreground">
                <Check className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">{fileName ?? "resume.pdf"}</span>
                <span className="text-xs text-text-muted">{isUploading ? "uploading…" : "uploaded"}</span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setState((prev) => ({ ...prev, resumeUploaded: false, extracted: null }))}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
              aria-label="Remove resume"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 transition-colors hover:border-accent"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
                <Upload className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-text-primary">Drop your resume or browse</span>
              <span className="text-xs text-text-muted">PDF only · max 2 MB</span>
            </button>
          </>
        )}

        {uploadError && <p className="text-sm text-error">{uploadError}</p>}

        {state.resumeUploaded && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-text-muted">Auto-fill your profile using AI to read your resume.</p>
            <button
              type="button"
              disabled={isExtracting}
              onClick={handleExtract}
              className="btn-signal rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {isExtracting ? "Extracting…" : state.extracted ? "Re-extract" : "Extract Profile"}
            </button>
          </div>
        )}
        {extractError && <p className="text-sm text-error">{extractError}</p>}
        {state.extracted && (
          <p className="text-sm text-success">Profile fields filled in — you can review them after setup.</p>
        )}

        <div className="rounded-xl bg-agent-light p-4">
          <p className="text-xs leading-6 text-agent-dark">
            <strong>Your resume stays yours.</strong> It&apos;s used only to grade jobs and tailor
            documents for you — never sold, never shared with employers or third parties.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {state.resumeUploaded ? "Continue" : "Skip for now"}
          </button>
        </div>
      </div>
    </StepShell>
  );
}

function StepConfirm({
  state,
  setState,
  onBack,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  function handleSubmit(): void {
    setError(null);
    startSubmit(async () => {
      const result = await completeOnboarding({
        jobTitlesSeeking: state.selectedRoles,
        workAuthorization: state.workAuth,
        experienceLevel: state.experienceLevel,
        acquisitionChannel: state.acquisitionChannel,
        extracted: state.extracted,
      });

      if (!result.success) {
        setError(result.error ?? "Something went wrong — please try again.");
        return;
      }

      router.push(result.redirectTo ?? "/profile");
    });
  }

  return (
    <StepShell step={3} total={3} question="Last thing — how senior a role, and how did you find us?">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {EXPERIENCE_LEVELS.map((level) => {
            const on = state.experienceLevel === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, experienceLevel: level }))}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  on ? "border-accent bg-accent/15" : "border-border hover:bg-surface-secondary"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    on ? "border-transparent bg-accent text-accent-foreground" : "border-border"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="text-sm font-medium text-text-primary">{level}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">How did you find Sortie?</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, acquisitionChannel: s }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  state.acquisitionChannel === s
                    ? "border-transparent bg-accent-muted text-accent"
                    : "border-border text-text-secondary hover:border-accent hover:text-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">Optional — it just tells us which channels actually work.</p>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="btn-signal inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : "Confirm & continue"}
          </button>
        </div>
      </div>
    </StepShell>
  );
}

export function OnboardingWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, setState] = useState<WizardState>({
    selectedRoles: [],
    workAuth: null,
    experienceLevel: null,
    acquisitionChannel: null,
    extracted: null,
    resumeUploaded: false,
  });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
      {step === 1 && <StepRoles state={state} setState={setState} onNext={() => setStep(2)} />}
      {step === 2 && (
        <StepUpload state={state} setState={setState} onNext={() => setStep(3)} onBack={() => setStep(1)} />
      )}
      {step === 3 && <StepConfirm state={state} setState={setState} onBack={() => setStep(2)} />}
    </main>
  );
}
