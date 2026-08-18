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
// C#/Java were researched (agy, 2026-08-18) and deliberately NOT added:
// both are technically buildable 100% client-side (Roslyn-in-WASM for C#,
// CheerpJ for Java can genuinely compile+run arbitrary source, not just
// bytecode) but carry a 20-30MB cold-boot payload and a multi-second
// initialization pause on first "Run" click — a meaningfully worse
// experience than every other language here, and a real product decision,
// not a technical limitation. Revisit only on explicit request.

export type SandboxResult = { output: string; error: string | null; timedOut: boolean };

// Longer than JS/Python's original 8s — Ruby/SQL's WASM downloads are
// heavier and need real room to initialize on a first run, confirmed live
// (both took several real seconds cold). Still short enough that a genuine
// infinite loop in already-initialized code fails fast.
const EXECUTION_TIMEOUT_MS = 15000;

const JS_WORKER_SOURCE = `
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
    const resultStr = typeof result === "undefined" ? "" : JSON.stringify(result);
    self.postMessage({ output: [...logs, resultStr].filter(Boolean).join("\\n"), error: null });
  } catch (err) {
    console.log = originalLog;
    self.postMessage({ output: logs.join("\\n"), error: err && err.message ? err.message : String(err) });
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
    let output = "";
    pyodide.setStdout({ batched: (s) => { output += s + "\\n"; } });
    pyodide.setStderr({ batched: (s) => { output += s + "\\n"; } });
    await pyodide.runPythonAsync(code);
    const result = await pyodide.runPythonAsync(callExpression);
    const resultStr = result === undefined || result === null ? "" : String(result);
    self.postMessage({ output: (output + resultStr).trim(), error: null });
  } catch (err) {
    self.postMessage({ output: "", error: err && err.message ? err.message : String(err) });
  }
};
`;

// transpileModule only (no type-checking against a full program/lib.d.ts) —
// this is a run sandbox, not an editor typecheck pass; a real type error
// would just get caught as a runtime error after transpilation instead,
// same as it would in most quick "run this snippet" tools.
const TYPESCRIPT_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/npm/typescript@${TYPESCRIPT_VERSION}/lib/typescript.js");

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
    const resultStr = typeof result === "undefined" ? "" : JSON.stringify(result);
    self.postMessage({ output: [...logs, resultStr].filter(Boolean).join("\\n"), error: null });
  } catch (err) {
    console.log = originalLog;
    self.postMessage({ output: logs.join("\\n"), error: err && err.message ? err.message : String(err) });
  }
};
`;

// The UMD bundle exports under the literal global key "ruby-wasm-wasi", not
// a normal identifier (confirmed live — a first attempt guessing the more
// obvious "RubyWasmWasi" failed) — must be read via bracket access.
const RUBY_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@${RUBY_WASM_VERSION}/dist/browser.umd.js");
const rubyLib = self["ruby-wasm-wasi"];
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
    self.postMessage({ output: String(result.toString()), error: null });
  } catch (err) {
    self.postMessage({ output: "", error: err && err.message ? err.message : String(err) });
  }
};
`;

// SQL doesn't fit the "define a function, then call it with fixed
// arguments" shape every other language here uses — there's nothing
// equivalent to "call the same function with 3 different inputs." SQL
// practice is "write a query against a fixed schema," so the whole editable
// buffer (schema-setup statements + the candidate's own query, all
// together) runs as one script; \`callExpression\` is accepted for a
// consistent function signature with the other run*() exports but ignored
// entirely here — the LAST statement's result set is what gets shown, so
// the candidate's query just needs to be the final statement in the editor.
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
      self.postMessage({ output: "(no result rows — make sure your last statement is a SELECT)", error: null });
      return;
    }
    const { columns, values } = results[results.length - 1];
    const rows = values.map((row) => columns.map((col, i) => col + "=" + JSON.stringify(row[i])).join(", "));
    self.postMessage({ output: rows.join("\\n") || "(0 rows)", error: null });
  } catch (err) {
    self.postMessage({ output: "", error: err && err.message ? err.message : String(err) });
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
      finish({ output: "", error: "Timed out after 15 seconds — check for an infinite loop.", timedOut: true });
    }, EXECUTION_TIMEOUT_MS);

    worker.onmessage = (event) => {
      finish({ output: event.data.output ?? "", error: event.data.error ?? null, timedOut: false });
    };

    worker.onerror = (event) => {
      finish({ output: "", error: event.message || "Worker error", timedOut: false });
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
