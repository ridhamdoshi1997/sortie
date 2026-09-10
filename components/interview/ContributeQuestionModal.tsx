"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitInterviewQuestion } from "@/actions/interviewContributions";
import { SectionModal } from "@/components/profile/SectionModal";
import { showToast } from "@/components/ui/ToastProvider";

const inputClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";

// Adapted, not copied: same four fields a real interview-question
// contribution needs (company, role, when, the question itself), but this
// app's own modal chrome (SectionModal — see components/profile/SectionModal
// for why a second modal pattern wasn't built for this) and this app's own
// disclosure copy. Deliberately no company AUTOCOMPLETE against a fixed
// list — restricting the field to companies we already know about would
// cap contributions at exactly the companies that need them least; a plain
// text field lets a candidate add a company this hub has never heard of,
// which is how the hub actually grows.
export function ContributeQuestionModal({
  onClose,
  defaultCompany,
}: {
  onClose: () => void;
  /** Pre-fills the company field from a company detail page's own "Contribute for {company}" entry point. */
  defaultCompany?: string;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(defaultCompany ?? "");
  const [role, setRole] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    if (!company.trim() || !role.trim() || question.trim().length < 10) {
      setError("Fill in the company, role, and the actual question you were asked.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await submitInterviewQuestion({
        company: company.trim(),
        role: role.trim(),
        interviewDate: interviewDate || null,
        question: question.trim(),
      });

      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      showToast("Thanks — your question is live for other candidates.", "success");
      router.refresh();
      onClose();
    });
  }

  return (
    <SectionModal
      title="Contribute an interview question"
      onClose={onClose}
      onSave={handleSave}
      saving={isPending}
      saveLabel="Submit"
      savingLabel="Submitting…"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-text-secondary">
          Thanks for helping other candidates prepare with a real question from your own interview. Please
          don&apos;t include personal information — yours or the interviewer&apos;s.
        </p>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Company</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Google"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Role</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Software Engineer, Financial Advisor"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Interview date (optional)</label>
          <input
            type="date"
            value={interviewDate}
            onChange={(e) => setInterviewDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">The question</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Share it as clearly as you remember — context, constraints, or follow-ups all help."
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
    </SectionModal>
  );
}
