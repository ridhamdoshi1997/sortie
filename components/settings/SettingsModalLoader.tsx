"use client";

import dynamic from "next/dynamic";

// SettingsModal is mounted once in the root layout (app/layout.tsx), a
// Server Component that also wraps fully static pages (the marketing
// homepage). Confirmed live 2026-07-29: rendering it there via a plain
// import + <Suspense> left the modal's HTML present on a cold load with
// ?settings=1 already in the URL, but with ZERO React fiber attached to it
// (checked directly via the DOM node's __react* keys) — genuinely
// unhydrated, inert server HTML. Effects never fired, so the settings fetch
// never ran and the modal was stuck on its loading spinner forever. Opening
// it via a client-side navigation from an already-hydrated page worked
// fine, which is why interaction testing alone didn't catch it — only a
// true cold load with the query param already present did.
//
// `ssr: false` sidesteps the whole problem: this component never attempts
// server rendering at all, so there's no SSR/static-page interaction to go
// wrong — it only ever mounts client-side, after hydration, guaranteeing
// its effects actually run. `ssr:false` can't be called directly inside a
// Server Component (app/layout.tsx isn't "use client"), hence this small
// wrapper.
const SettingsModal = dynamic(
  () => import("@/components/settings/SettingsModal").then((mod) => mod.SettingsModal),
  { ssr: false },
);

export function SettingsModalLoader() {
  return <SettingsModal />;
}
