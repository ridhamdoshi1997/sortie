import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // §Q5's browser extension — a separate Manifest V3 artifact with its own
    // runtime (plain scripts + importScripts, chrome.* globals), not part of
    // this Next.js app's module/lint semantics.
    "extension/**",
  ]),
]);

export default eslintConfig;
