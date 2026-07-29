import { notFound } from "next/navigation";

// /preview/* renders real components with dummy props for design review —
// never wired to the backend, never meant to be reachable by a real user.
// A single layout-level gate covers every route under this segment, so no
// individual page.tsx needs its own check.
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return children;
}
