"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Play, Terminal, X, XCircle } from "lucide-react";

import {
  gradeAnswer,
  runJavaScript,
  runPython,
  runRuby,
  runSQL,
  runTypeScript,
  type SandboxResult,
  type Verdict,
} from "@/lib/practiceSandbox";
import type { PracticeKit } from "@/lib/interviewQuestions";

// Monaco touches window/document directly and crashes under SSR — must load
// via next/dynamic(..., {ssr:false}), which also code-splits its ~2-3MB
// bundle away from the initial page load (build-plan.md §N's feasibility
// research, 2026-08-14).
const Editor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-lg bg-surface-secondary" />,
});

const LANGUAGE_CONFIG: Record<
  PracticeKit["language"],
  { label: string; monacoLanguage: string; run: (code: string, callExpression: string) => Promise<SandboxResult> }
> = {
  javascript: { label: "JavaScript", monacoLanguage: "javascript", run: runJavaScript },
  typescript: { label: "TypeScript", monacoLanguage: "typescript", run: runTypeScript },
  python: { label: "Python", monacoLanguage: "python", run: runPython },
  ruby: { label: "Ruby", monacoLanguage: "ruby", run: runRuby },
  sql: { label: "SQL", monacoLanguage: "sql", run: runSQL },
};

const STORAGE_PREFIX = "sortie:practice-code";
const SAVE_DEBOUNCE_MS = 500;

function storageKeyFor(storageKey: string, language: string): string {
  return `${STORAGE_PREFIX}:${storageKey}:${language}`;
}

function formatReturnValue(value: string | null): string {
  if (value === null) return "(no return value)";
  if (value === "NO_RESULT_ROWS") return "(no result rows — make sure your last statement is a SELECT)";
  return value;
}

type TestResult = { user: SandboxResult; reference: SandboxResult; verdict: Verdict };

// Strict pass/fail grading (agy critique, 2026-08-18) — replaces the
// original "soft verification," eyeball-both-outputs design. The candidate
// vs reference outputs are still both shown for context, but each test now
// carries a real verdict computed by lib/practiceSandbox.ts's
// gradeAnswer(), not a judgment call left to the candidate. If the
// reference solution itself errors (a real possibility — it's
// AI-generated, same as the question), that one test is flagged
// "reference_error" and falls back to showing both outputs unlabeled
// rather than claiming a verdict it can't actually back.
export function PracticeSandbox({
  practiceKit,
  storageKey,
  onClose,
}: {
  practiceKit: PracticeKit;
  storageKey: string;
  onClose: () => void;
}) {
  const config = LANGUAGE_CONFIG[practiceKit.language];
  const persistKey = storageKeyFor(storageKey, practiceKit.language);

  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return practiceKit.starterCode;
    return window.localStorage.getItem(persistKey) ?? practiceKit.starterCode;
  });
  const [activeTestIndex, setActiveTestIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"tests" | "console">("tests");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<(TestResult | null)[]>(() => practiceKit.testCases.map(() => null));

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced localStorage persistence — a page nav or accidental refresh
  // used to silently lose everything typed into the editor (agy critique,
  // 2026-08-18: "a critical product failure" for an interview-prep tool).
  function handleCodeChange(value: string): void {
    setCode(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      window.localStorage.setItem(persistKey, value);
    }, SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const activeTest = practiceKit.testCases[activeTestIndex];
  const activeResult = results[activeTestIndex];
  // SQL has no meaningful "call a function with these arguments" test case —
  // the candidate's query is the last statement in `code` itself, and the
  // whole buffer runs as one script (see runSQL's own comment).
  const isSql = practiceKit.language === "sql";

  async function handleRunAll(): Promise<void> {
    setRunning(true);
    setActiveTab("tests");
    const next = await Promise.all(
      practiceKit.testCases.map(async (test) => {
        const [reference, user] = await Promise.all([
          config.run(practiceKit.referenceSolution, test.callExpression),
          config.run(code, test.callExpression),
        ]);
        return { user, reference, verdict: gradeAnswer(user, reference) };
      })
    );
    setResults(next);
    setActiveTestIndex(0);
    setRunning(false);
  }

  const passCount = results.filter((r) => r?.verdict === "pass").length;
  const gradedCount = results.filter((r) => r !== null).length;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Practice Sandbox — {config.label}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close practice sandbox"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3">
        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-agent" />
        <p className="text-xs leading-5 text-text-secondary">
          Runs entirely in your own browser — nothing you type here is sent anywhere. Your code is saved locally as
          you type. Test cases are AI-generated to help verify your logic; trust your own judgment for real edge
          cases.
        </p>
      </div>

      {!isSql && practiceKit.testCases.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {practiceKit.testCases.map((tc, i) => {
            const r = results[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setActiveTestIndex(i);
                  setActiveTab("tests");
                }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  i === activeTestIndex
                    ? "bg-accent/15 text-accent"
                    : "border border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                <TestVerdictIcon verdict={r?.verdict} />
                Test {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {!isSql && (
        <div>
          <p className="text-xs text-text-secondary">{activeTest.description}</p>
          <code className="mt-1 block truncate font-mono text-xs text-text-muted">{activeTest.callExpression}</code>
        </div>
      )}
      {isSql && <p className="text-xs text-text-secondary">{activeTest.description}</p>}

      <div className="overflow-hidden rounded-lg border border-border">
        <Editor
          height="240px"
          language={config.monacoLanguage}
          value={code}
          onChange={(value) => handleCodeChange(value ?? "")}
          theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRunAll}
          disabled={running}
          className="btn-signal inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Running…" : isSql ? "Run Query" : "Run Tests"}
        </button>
        {gradedCount > 0 && !isSql && practiceKit.testCases.length > 1 && (
          <p className="text-xs font-medium text-text-secondary">
            {passCount}/{gradedCount} passed
          </p>
        )}
      </div>

      {activeResult && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
            <TabButton active={activeTab === "tests"} onClick={() => setActiveTab("tests")} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Result" />
            <TabButton active={activeTab === "console"} onClick={() => setActiveTab("console")} icon={<Terminal className="h-3.5 w-3.5" />} label="Console" />
          </div>
          <div className="p-3">
            {activeTab === "tests" ? (
              <ResultPanel result={activeResult} />
            ) : (
              <ConsolePanel result={activeResult} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-b-2 border-accent text-accent" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TestVerdictIcon({ verdict }: { verdict?: Verdict }) {
  if (!verdict) return null;
  if (verdict === "pass") return <CheckCircle2 className="h-3 w-3 text-success" />;
  if (verdict === "reference_error") return <AlertTriangle className="h-3 w-3 text-warning" />;
  return <XCircle className="h-3 w-3 text-error" />;
}

function ResultPanel({ result }: { result: TestResult }) {
  if (result.verdict === "reference_error") {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Sortie&apos;s reference solution errored on this test — can&apos;t grade it. Compare outputs yourself.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OutputBlock label="Your output" value={formatReturnValue(result.user.returnValue)} error={result.user.error} />
          <OutputBlock label="Reference output" value={formatReturnValue(result.reference.returnValue)} error={result.reference.error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        className={`flex items-center gap-1.5 text-xs font-semibold ${
          result.verdict === "pass" ? "text-success" : "text-error"
        }`}
      >
        {result.verdict === "pass" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {result.verdict === "pass" ? "Passed" : "Failed"}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OutputBlock label="Expected" value={formatReturnValue(result.reference.returnValue)} error={null} />
        <OutputBlock label="Your output" value={formatReturnValue(result.user.returnValue)} error={result.user.error} />
      </div>
    </div>
  );
}

function ConsolePanel({ result }: { result: TestResult }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        Your console output
      </p>
      {result.user.stdout ? (
        <pre className="overflow-x-auto text-xs leading-5 text-text-primary">{result.user.stdout}</pre>
      ) : (
        <p className="text-xs text-text-muted">Nothing printed — use console.log/print/puts in your code to debug here.</p>
      )}
    </div>
  );
}

function OutputBlock({ label, value, error }: { label: string; value: string; error: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-3">
      <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {error ? (
        <p className="text-xs leading-5 text-error">{error}</p>
      ) : (
        <pre className="overflow-x-auto text-xs leading-5 text-text-primary">{value}</pre>
      )}
    </div>
  );
}
