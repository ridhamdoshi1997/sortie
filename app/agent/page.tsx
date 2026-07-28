import { Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default async function AgentPage() {
  await requireUser();

  return (
    <>
      <Navbar isAuthenticated />
      <ComingSoon
        icon={Sparkles}
        title="Agent"
        description="A general AI chat co-pilot is coming here — for now, per-document AI chat already lives on each job's Documents section."
      />
    </>
  );
}
