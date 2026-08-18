"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, Play, X } from "lucide-react";

import { runJavaScript, runPython, type SandboxResult } from "@/lib/practiceSandbox";
import type { PracticeKit } from "@/lib/interviewQuestions";

// Monaco touches window/document directly and crashes under SSR — must load
// via next/dynamic(..., {ssr:false}), which also code-splits its ~2-3MB
// bundle away from the initial page load (build-plan.md §N's feasibility
// research, 2026-08-14).
const Editor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-lg bg-surface-secondary" />,
});

// "Soft verification," not strict pass/fail grading (build-plan.md §N) —
// an LLM asked to generate test cases for its own AI-generated question is
// genuinely unreliable for a strict binary verdict. Instead: run the same
// call against the candidate's code AND a real reference solution, in the
// same isolated sandbox, and show both outputs side by side — the
// candidate judges correctness themselves, this never claims to.
export function PracticeSandbox({ practiceKit, onClose }: { practiceKit: PracticeKit; onClose: () => void }) {
  const [code, setCode] = useState(practiceKit.starterCode);
  const [activeTestIndex, setActiveTestIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [userResult, setUserResult] = useState<SandboxResult | null>(null);
  const [referenceResult, setReferenceResult] = useState<SandboxResult | null>(null);

  const activeTest = practiceKit.testCases[activeTestIndex];
  const runFn = practiceKit.language === "python" ? runPython : runJavaScript;
  const monacoLanguage = practiceKit.language === "python" ? "python" : "javascript";

  async function handleRun(): Promise<void> {
    setRunning(true);
    setUserResult(null);
    setReferenceResult(null);
    const [user, reference] = await Promise.all([
      runFn(code, activeTest.callExpression),
      runFn(practiceKit.referenceSolution, activeTest.callExpression),
    ]);
    setUserResult(user);
    setReferenceResult(reference);
    setRunning(false);
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">
          Practice Sandbox — {practiceKit.language === "python" ? "Python" : "JavaScript"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close practice sandbox"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-2">
        <p className="text-xs leading-5 text-agent-dark">
          Runs entirely in your own browser — nothing you type here is sent anywhere. Test cases are
          AI-generated to help verify your logic; trust your own judgment for real edge cases.
        </p>
      </div>

      {practiceKit.testCases.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {practiceKit.testCases.map((tc, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setActiveTestIndex(i);
                setUserResult(null);
                setReferenceResult(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                i === activeTestIndex
                  ? "bg-accent-light text-accent"
                  : "border border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              Test {i + 1}
            </button>
          ))}
        </div>
      )}
      <div>
        <p className="text-xs text-text-secondary">{activeTest.description}</p>
        <code className="mt-1 block truncate font-mono text-xs text-text-muted">{activeTest.callExpression}</code>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Editor
          height="240px"
          language={monacoLanguage}
          value={code}
          onChange={(value) => setCode(value ?? "")}
          theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
        />
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running…" : "Run Code"}
      </button>

      {(userResult || referenceResult) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OutputPanel label="Your output" result={userResult} />
          <OutputPanel label="AI reference output" result={referenceResult} />
        </div>
      )}
    </div>
  );
}

function OutputPanel({ label, result }: { label: string; result: SandboxResult | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {!result ? (
        <p className="text-xs text-text-muted">—</p>
      ) : result.error ? (
        <p className="text-xs leading-5 text-error">{result.error}</p>
      ) : (
        <pre className="overflow-x-auto text-xs leading-5 text-text-primary">{result.output || "(no output)"}</pre>
      )}
    </div>
  );
}
