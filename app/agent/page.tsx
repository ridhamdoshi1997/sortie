import { Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { NavigatorChat } from "@/components/agent/NavigatorChat";
import { listAgentMessages } from "@/actions/agent";

export default async function AgentPage() {
  await requireUser();
  const { data: messages } = await listAgentMessages();

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-agent-light text-agent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Navigator</h1>
            <p className="text-sm text-text-muted">Your AI copilot across the whole mission.</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-border bg-surface p-6 shadow-card">
          <NavigatorChat initialMessages={messages} />
        </div>
      </main>
    </>
  );
}
