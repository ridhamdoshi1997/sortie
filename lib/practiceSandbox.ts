// Client-side, sandboxed code execution for the Practice Sandbox
// (build-plan.md §N's feasibility research, 2026-08-14) — 100% client-side,
// $0 infra, no execution ever touches this app's own servers. JavaScript
// runs in a real Web Worker (isolated from the page, terminated on
// timeout); Python runs via Pyodide (CPython compiled to WebAssembly),
// loaded lazily from its own CDN *inside* the worker via importScripts —
// deliberately NOT added as an npm dependency. Pyodide's real payload is
// its WASM/data files (~10MB), not the small JS loader npm ships; serving
// those yourself needs webpack/asset config this app doesn't otherwise
// need. Loading from jsdelivr (Pyodide's own recommended CDN) means the
// only real new npm dependency this feature needs is @monaco-editor/react.
//
// Both languages run in a genuinely isolated Worker (own global scope, own
// thread) — user-submitted code never runs on the main thread or touches
// this app's own DOM/state.

export type SandboxResult = { output: string; error: string | null; timedOut: boolean };

const EXECUTION_TIMEOUT_MS = 8000;

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

// Pinned to a specific Pyodide version, not "latest" — an unpinned CDN
// version could change its API surface (setStdout/runPythonAsync) under
// this app without warning. Bump deliberately, not silently.
const PYODIDE_VERSION = "0.26.4";

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
      finish({ output: "", error: "Timed out after 8 seconds — check for an infinite loop.", timedOut: true });
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

export function runPython(code: string, callExpression: string): Promise<SandboxResult> {
  return runInWorker(PYTHON_WORKER_SOURCE, code, callExpression);
}
