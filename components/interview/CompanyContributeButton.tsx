"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";

import { ContributeQuestionModal } from "@/components/interview/ContributeQuestionModal";

// Small client island so the company detail page (app/interview-questions/
// company/[key]/page.tsx) can stay a server component — the same split
// InterviewHub.tsx uses for the main grid's contribute entry point, just
// scoped to one already-known company rather than a free-text field.
export function CompanyContributeButton({ company, isSignedIn }: { company: string; isSignedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() =>
          isSignedIn ? setOpen(true) : (window.location.href = "/login?mode=signup&next=/interview-questions")
        }
        className="btn-signal inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Contribute a question for {company}
      </button>
      {open && <ContributeQuestionModal onClose={() => setOpen(false)} defaultCompany={company} />}
    </>
  );
}
