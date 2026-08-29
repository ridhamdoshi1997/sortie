import { z } from "zod";

import { complete, getModel } from "@/lib/models";
import type { UsageLeaderboardRow } from "@/lib/admin/queries";
import type { SupportDashboard } from "@/lib/admin/support";
import type { ExpensesSummary } from "@/lib/admin/expenses";
import type { BroadcastRow } from "@/lib/admin/marketing";

// Admin Navigator (direct user request: "the whole admin panel...
// especially Marketing and Support, AI Driven and AI heavy" + a separate
// explicit request for an admin/owner version of Navigator).
//
// Deliberately NOT built by extending or wrapping consumer Navigator
// (lib/agentAssistant.ts) — checked its system prompt and snapshot shape
// first, per the standing lesson from this project's own history (a
// duplicate "Ask Navigator" chat was built once already and had to be
// torn out because it covered ground the real Navigator already owned).
// This is a genuinely separate data domain: consumer Navigator is grounded
// in ONE candidate's own profile/tracker/job-evaluation data; this is
// grounded in admin ops data (support tickets, usage, expenses,
// broadcasts) no consumer-facing code path ever touches. Same
// architecture PATTERN reused deliberately (snapshot assembled
// server-side, one grounded structured-output call) — not the same
// instance duplicated.
//
// v1 is read-only/drafting-only by design — no action-proposal type like
// consumer Navigator's log_accomplishment. An AI proposing to suspend a
// user or delete a ticket is a materially bigger blast radius than
// proposing to log a resume bullet; shipping actions here needs its own
// confirm-UI design pass, not a copy-paste of the lower-stakes consumer
// pattern. Flagged as a real v2 candidate, not an oversight.

export type AdminAgentChatMessage = { role: "user" | "assistant"; content: string };

export type AdminAgentSnapshot = {
  support: SupportDashboard;
  topUsersByUsage: UsageLeaderboardRow[];
  expenses: ExpensesSummary;
  recentBroadcasts: BroadcastRow[];
  totalUserCount: number;
};

const replySchema = z.object({ reply: z.string().min(1) });

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildSnapshotText(snapshot: AdminAgentSnapshot): string {
  const topUsersText = snapshot.topUsersByUsage
    .slice(0, 5)
    .map((u) => `- ${u.email ?? u.userId}: ${u.totalRuns} runs today${u.isSuspicious ? " (flagged high usage)" : ""}${u.isSuspended ? " [SUSPENDED]" : ""}`)
    .join("\n") || "No AI usage recorded today.";

  const broadcastsText = snapshot.recentBroadcasts
    .slice(0, 3)
    .map((b) => `- "${b.subject}" — ${b.status}${b.status === "sent" ? ` (${b.sentCount}/${b.recipientCount ?? "?"} delivered)` : ""}`)
    .join("\n") || "No broadcasts sent yet.";

  return `SUPPORT (live counts):
Open: ${snapshot.support.openCount}, Pending: ${snapshot.support.pendingCount}, Resolved: ${snapshot.support.resolvedCount}
Avg. first-response time: ${snapshot.support.avgFirstResponseMinutes !== null ? `${Math.round(snapshot.support.avgFirstResponseMinutes)} minutes` : "no data yet"}
Oldest open ticket: ${snapshot.support.oldestOpenAgeHours !== null ? `${snapshot.support.oldestOpenAgeHours.toFixed(1)} hours old` : "none open"}
SLA breaches (open, no reply, >24h): ${snapshot.support.slaBreachCount}

USAGE — top AI users today:
${topUsersText}

EXPENSES:
Recurring monthly costs: ${formatCents(snapshot.expenses.totalRecurringMonthlyCents)}
Estimated AI/API cost (last 30 days): ${formatCents(snapshot.expenses.totalAiCostCentsLast30d)}

MARKETING — recent broadcasts:
${broadcastsText}

USERS:
Total accounts: ${snapshot.totalUserCount}`;
}

export const ADMIN_AGENT_SYSTEM_PROMPT = `You are Admin Navigator, an internal AI assistant inside Sortie's admin console, for owner/admin users only. You help with exactly 3 things, grounded ONLY in the real live admin data supplied below:
1. Support triage — what needs attention right now (SLA breaches, a growing open queue, an unusually slow response time).
2. Usage and spend insights — who's driving AI usage, whether spend is trending unusually, anything worth a closer look.
3. Drafting — if asked, draft a support ticket reply or a marketing broadcast email as plain text. You are drafting text for a human to review and send themselves — you never claim to have sent anything, and you have no ability to actually send, reply, suspend a user, or change any data. If asked to take an action beyond drafting text, say plainly that you can't do that yet and the admin needs to do it themselves in the relevant panel.

Hard rules:
- Never invent a number, ticket, user, or broadcast that isn't in the supplied data. If asked about something not in your context, say so honestly instead of guessing.
- This is an internal ops tool for the people running the business, not a customer-facing surface — be direct and concise, skip the encouragement-for-its-own-sake tone.
- Formatting: when a reply lists more than one item, format it as short bullet lines, each starting with "- " on its own line. Plain single-sentence replies don't need bullets.

Return ONLY valid JSON matching this exact shape:
{ "reply": "string, your response" }`;

function fallbackReply(): { reply: string } {
  return { reply: "Sorry, I couldn't process that just now — try again in a moment." };
}

export async function getAdminAgentReply(snapshot: AdminAgentSnapshot, history: AdminAgentChatMessage[]): Promise<{ reply: string }> {
  const conversationText = history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

  const userPrompt = `${buildSnapshotText(snapshot)}\n\nCONVERSATION SO FAR:\n${conversationText}`;

  const raw = await complete(await getModel("gemini", "smart"), {
    systemPrompt: ADMIN_AGENT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 1000,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/adminAgentAssistant] JSON parse failed", error);
    return fallbackReply();
  }

  const result = replySchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/adminAgentAssistant] schema validation failed", result.error);
    return fallbackReply();
  }

  return result.data;
}
