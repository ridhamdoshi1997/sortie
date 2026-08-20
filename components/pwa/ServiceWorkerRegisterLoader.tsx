"use client";

import dynamic from "next/dynamic";

// Same ssr:false wrapper pattern as the other root-mounted loaders.
const ServiceWorkerRegister = dynamic(
  () => import("@/components/pwa/ServiceWorkerRegister").then((mod) => mod.ServiceWorkerRegister),
  { ssr: false },
);

export function ServiceWorkerRegisterLoader() {
  return <ServiceWorkerRegister />;
}
