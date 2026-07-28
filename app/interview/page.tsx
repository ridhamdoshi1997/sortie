import { MessagesSquare } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default async function InterviewPage() {
  await requireUser();

  return (
    <>
      <Navbar isAuthenticated />
      <ComingSoon
        icon={MessagesSquare}
        title="Interview"
        description="Interview questions by company are coming here, plus a per-job interview prep tab on job details."
      />
    </>
  );
}
