// Client-side, sandboxed code execution for the Practice Sandbox
// (build-plan.md §N's feasibility research, 2026-08-14) — 100% client-side,
// $0 infra, no execution ever touches this app's own servers. JavaScript
// runs in a real Web Worker (isolated from the page, terminated on
// timeout); TypeScript transpiles to JS in the same worker via the real
// TypeScript compiler loaded from CDN (`ts.transpileModule`, type-checking
// skipped — this is a run sandbox, not an IDE); Python/Ruby/SQL each run
// via a real WASM port of their language (Pyodide/ruby.wasm/sql.js), all
// loaded lazily from their own CDN *inside* the worker — deliberately NOT
// added as npm dependencies. Each one's real payload is WASM/data files
// npm doesn't bundle either; serving those yourself needs webpack/asset
// config this app doesn't otherwise need. This keeps the only real new npm
// dependency this whole feature needs down to @monaco-editor/react.
//
// Every language runs in a genuinely isolated Worker (own global scope, own
// thread) — user-submitted code never runs on the main thread or touches
// this app's own DOM/state.
//
// Java/C# researched twice (agy, 2026-08-18): Java is technically
// buildable client-side (CheerpJ can genuinely compile+run raw .java
// source in a Worker) but requires a paid commercial license past a
// 1-person company — not a free CDN-script option like everything here.
// C# has no genuine client-only live-compile path at all (Roslyn-in-WASM
// would mean self-hosting a custom Blazor build plus the .NET framework
// DLLs, not loading from a CDN). Both need a self-hosted server-side judge
// (Piston) instead — deferred pending that infrastructure being stood up,
// not a rejection of the languages themselves.

export type SandboxResult = {
  // Captured console.log/print/puts output — separate from the graded
  // value so a candidate's own debugging prints never get compared against
  // the reference solution's output (agy critique, 2026-08-18: mixing the
  // two makes strict grading impossible and makes debugging output noisy).
  stdout: string;
  // The final expression's value, canonicalized to a string so two
  // independent executions (candidate vs reference) can be compared for an
  // exact pass/fail verdict. null when execution never produced one
  // (errored, or — SQL only — the query returned no rows).
  returnValue: string | null;
  error: string | null;
  timedOut: boolean;
};

export type Verdict = "pass" | "fail" | "reference_error";

// Runs against the SAME callExpression, always in this order: reference
// solution first (so a broken AI-generated reference is caught as
// "reference_error" rather than silently failing every candidate
// submission), candidate second. Grading is exact-string equality on
// canonicalized returnValue — see canonicalStringify's per-language
// implementation inside each worker source below for what "canonical"
// means per language. This replaces the original "soft verification, let
// the candidate eyeball both outputs" design (agy critique, 2026-08-18:
// eyeballing large/nested outputs is unreliable and feels like a raw text
// editor, not a practice tool) — reference and candidate outputs are still
// both shown, but now labeled with a real verdict instead of asking the
// candidate to judge correctness themselves.
export function gradeAnswer(user: SandboxResult, reference: SandboxResult): Verdict {
  if (reference.error || reference.timedOut) return "reference_error";
  if (user.error || user.timedOut) return "fail";
  return user.returnValue === reference.returnValue ? "pass" : "fail";
}

// Longer than JS/Python's original 8s — Ruby/SQL's WASM downloads are
// heavier and need real room to initialize on a first run, confirmed live
// (both took several real seconds cold). Still short enough that a genuine
// infinite loop in already-initialized code fails fast.
const EXECUTION_TIMEOUT_MS = 15000;

// Duplicated verbatim into every JS-family worker source below (JS/TS) —
// each worker is a standalone Blob script with no shared module scope, so
// this can't be imported/shared normally. Sorts object keys before
// stringifying so two structurally-equal-but-differently-ordered objects
// (e.g. candidate returns {b:2,a:1}, reference returns {a:1,b:2}) still
// compare equal — plain JSON.stringify would treat those as different.
// Arrays stay order-sensitive, since element order is usually significant
// to problem correctness.
const CANONICAL_STRINGIFY_JS = `
function canonicalStringify(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalStringify(v) ?? "null").join(",") + "]";
  var keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + (canonicalStringify(value[k]) ?? "null")).join(",") + "}";
}
`;

const JS_WORKER_SOURCE = `
${CANONICAL_STRINGIFY_JS}
self.onmessage = function (event) {
  const { code, callExpression } = event.data;
  const logs = [];
  const originalLog = console.log;
  console.log = function (...args) {
    logs.push(args.map(String).join(" "));
  };
  try {
    const fn = new Function(code + "\\nreturn (" + callExpression + ");");
    const result = fn();
    console.log = originalLog;
    self.postMessage({ stdout: logs.join("\\n"), returnValue: canonicalStringify(result) ?? null, error: null });
  } catch (err) {
    console.log = originalLog;
    self.postMessage({ stdout: logs.join("\\n"), returnValue: null, error: err && err.message ? err.message : String(err) });
  }
};
`;

// Pinned versions everywhere, not "latest" — an unpinned CDN version could
// change its API surface under this app without warning. Bump deliberately.
const PYODIDE_VERSION = "0.26.4";
const TYPESCRIPT_VERSION = "5.6.3";
const RUBY_WASM_VERSION = "2.7.1";
const SQLJS_VERSION = "1.11.0";

const PYTHON_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js");
let pyodideReadyPromise = loadPyodide();

self.onmessage = async function (event) {
  const { code, callExpression } = event.data;
  try {
    const pyodide = await pyodideReadyPromise;
    let stdout = "";
    pyodide.setStdout({ batched: (s) => { stdout += s + "\\n"; } });
    pyodide.setStderr({ batched: (s) => { stdout += s + "\\n"; } });
    await pyodide.runPythonAsync(code);
    const result = await pyodide.runPythonAsync(callExpression);
    const returnValue = result === undefined || result === null ? null : String(result);
    self.postMessage({ stdout: stdout.trim(), returnValue, error: null });
  } catch (err) {
    self.postMessage({ stdout: "", returnValue: null, error: err && err.message ? err.message : String(err) });
  }
};
`;

// transpileModule only (no type-checking against a full program/lib.d.ts) —
// this is a run sandbox, not an editor typecheck pass; a real type error
// would just get caught as a runtime error after transpilation instead,
// same as it would in most quick "run this snippet" tools.
const TYPESCRIPT_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/npm/typescript@${TYPESCRIPT_VERSION}/lib/typescript.js");
${CANONICAL_STRINGIFY_JS}
self.onmessage = function (event) {
  const { code, callExpression } = event.data;
  const logs = [];
  const originalLog = console.log;
  console.log = function (...args) {
    logs.push(args.map(String).join(" "));
  };
  try {
    const transpiled = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const fn = new Function(transpiled + "\\nreturn (" + callExpression + ");");
    const result = fn();
    console.log = originalLog;
    self.postMessage({ stdout: logs.join("\\n"), returnValue: canonicalStringify(result) ?? null, error: null });
  } catch (err) {
    console.log = originalLog;
    self.postMessage({ stdout: logs.join("\\n"), returnValue: null, error: err && err.message ? err.message : String(err) });
  }
};
`;

// The UMD bundle exports under the literal global key "ruby-wasm-wasi", not
// a normal identifier (confirmed live — a first attempt guessing the more
// obvious "RubyWasmWasi" failed) — must be read via bracket access.
//
// Stdout capture: DefaultRubyVM's public options only expose a boolean
// `consolePrint` flag, not a custom stdout callback (confirmed by reading
// the UMD source directly, 2026-08-18) — internally it builds a
// `consolePrinter()` whose default `stdout`/`stderr` are literal
// `console.log`/`console.warn` **function references, captured once at VM
// creation time**. Overriding `console.log` AFTER the VM is created
// wouldn't be seen by it. So the override below happens at worker
// top-level, before `vmReadyPromise`'s IIFE ever calls `DefaultRubyVM` —
// by the time it runs, `console.log` already points at this capturing
// function, so the VM's default printer captures it by reference at
// creation time, same trick as every other worker's console.log override,
// just ordered earlier. Only `console.log` is overridden, NOT
// `console.warn` — confirmed live that `puts` output goes through
// `console.log` (stdout) while the VM's own startup boilerplate ("RubyGems
// were not loaded", etc.) goes through `console.warn` (stderr); capturing
// both into the same buffer would show that boilerplate to the candidate
// on every single run.
const RUBY_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@${RUBY_WASM_VERSION}/dist/browser.umd.js");
const rubyLib = self["ruby-wasm-wasi"];

const logs = [];
console.log = function (...args) { logs.push(args.map(String).join(" ")); };

let vmReadyPromise = (async () => {
  const response = await fetch("https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@${RUBY_WASM_VERSION}/dist/ruby.wasm");
  const buffer = await response.arrayBuffer();
  const module = await WebAssembly.compile(buffer);
  const { vm } = await rubyLib.DefaultRubyVM(module);
  return vm;
})();

self.onmessage = async function (event) {
  const { code, callExpression } = event.data;
  try {
    const vm = await vmReadyPromise;
    vm.eval(code);
    const result = vm.eval(callExpression);
    const returnValue = result === undefined || result === null ? null : String(result.toString());
    self.postMessage({ stdout: logs.join("\\n"), returnValue, error: null });
  } catch (err) {
    self.postMessage({ stdout: logs.join("\\n"), returnValue: null, error: err && err.message ? err.message : String(err) });
  }
};
`;

// SQL doesn't fit the "define a function, then call it with fixed
// arguments" shape every other language here uses — there's nothing
// equivalent to "call the same function with 3 different inputs." SQL
// practice is "write a query against a fixed schema," so the whole editable
// buffer (schema-setup statements + the candidate's own query, all
// together) runs as one script; `callExpression` is accepted for a
// consistent function signature with the other run*() exports but ignored
// entirely here — the LAST statement's result set is what gets graded, so
// the candidate's query just needs to be the final statement in the editor.
// The formatted "col=value" row string doubles as both the display text
// AND the graded returnValue — it's already a deterministic, canonical
// representation of the result set, so there's no separate comparison
// value to compute. "NO_RESULT_ROWS" is a sentinel, not null, so a
// candidate query that correctly returns zero rows still grades correctly
// against a reference that also returns zero rows.
const SQL_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/sql-wasm.js");
let dbReadyPromise = (async () => {
  const SQL = await initSqlJs({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/" + file });
  return new SQL.Database();
})();

self.onmessage = async function (event) {
  const { code } = event.data;
  try {
    const db = await dbReadyPromise;
    const results = db.exec(code);
    if (results.length === 0) {
      self.postMessage({ stdout: "", returnValue: "NO_RESULT_ROWS", error: null });
      return;
    }
    const { columns, values } = results[results.length - 1];
    const rows = values.map((row) => columns.map((col, i) => col + "=" + JSON.stringify(row[i])).join(", "));
    self.postMessage({ stdout: "", returnValue: rows.join("\\n") || "(0 rows)", error: null });
  } catch (err) {
    self.postMessage({ stdout: "", returnValue: null, error: err && err.message ? err.message : String(err) });
  }
};
`;

function runInWorker(source: string, code: string, callExpression: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const blob = new Blob([source], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    let settled = false;

    function finish(result: SandboxResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(result);
    }

    const timeout = setTimeout(() => {
      finish({ stdout: "", returnValue: null, error: "Timed out after 15 seconds — check for an infinite loop.", timedOut: true });
    }, EXECUTION_TIMEOUT_MS);

    worker.onmessage = (event) => {
      finish({
        stdout: event.data.stdout ?? "",
        returnValue: event.data.returnValue ?? null,
        error: event.data.error ?? null,
        timedOut: false,
      });
    };

    worker.onerror = (event) => {
      finish({ stdout: "", returnValue: null, error: event.message || "Worker error", timedOut: false });
    };

    worker.postMessage({ code, callExpression });
  });
}

export function runJavaScript(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(JS_WORKER_SOURCE, code, callExpression);
}

export function runTypeScript(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(TYPESCRIPT_WORKER_SOURCE, code, callExpression);
}

export function runPython(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(PYTHON_WORKER_SOURCE, code, callExpression);
}

export function runRuby(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(RUBY_WORKER_SOURCE, code, callExpression);
}

export function runSQL(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(SQL_WORKER_SOURCE, code, callExpression);
}
