import { createAdminDbClient } from "@/lib/admin/client";

// Interview content admin (Phase 52, section 4).
//
// contributed_interview_questions shipped in Phase 51 with an explicit,
// documented "no moderation" gap: public user-generated content, rendered on
// unauthenticated SEO pages, with zero admin surface. This module is the
// missing surface — a review queue, plus the tracking the plan asked for
// (per-company counts, volume over time, and which companies are carried by
// AI-generated banks versus real contributed questions).
//
// That last distinction is the one that matters editorially. The hub's whole
// claim is that these are questions real candidates were actually asked; a
// company whose page is entirely AI-generated is a different product than one
// backed by real submissions, and nothing surfaced which was which.

export type ModerationStatus = "pending" | "published" | "rejected";

export type ContributedQuestionRow = {
  id: string;
  company: string;
  companyKey: string;
  role: string;
  question: string;
  interviewDate: string | null;
  createdAt: string;
  status: ModerationStatus;
  source: "contributed" | "admin";
  moderatedAt: string | null;
  moderatedBy: string | null;
  submitterEmail: string | null;
};

export type CompanyCoverageRow = {
  companyKey: string;
  company: string;
  aiQuestionCount: number;
  contributedCount: number;
  pendingCount: number;
};

export type InterviewAdminData = {
  queue: ContributedQuestionRow[];
  counts: Record<ModerationStatus, number>;
  coverage: CompanyCoverageRow[];
  /** Contributions per day over the trailing window, for a volume read. */
  volume: { date: string; count: number }[];
  windowDays: number;
};

const VOLUME_DAYS = 30;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function countQuestions(questions: unknown): number {
  return Array.isArray(questions) ? questions.length : 0;
}

export async function getInterviewAdminData(): Promise<InterviewAdminData> {
  const admin = createAdminDbClient();

  const [{ data: rows }, { data: banks }] = await Promise.all([
    admin.database
      .from("contributed_interview_questions")
      .select("id,user_id,company,company_key,role,question,interview_date,created_at,status,source,moderated_at,moderated_by")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.database.from("interview_question_banks").select("company,questions"),
  ]);

  const all = (rows ?? []) as {
    id: string;
    user_id: string;
    company: string;
    company_key: string;
    role: string;
    question: string;
    interview_date: string | null;
    created_at: string;
    status: ModerationStatus;
    source: "contributed" | "admin";
    moderated_at: string | null;
    moderated_by: string | null;
  }[];

  // Submitter identity is the point of a moderation queue — "who sent this"
  // is how you spot one account spamming. One lookup for the ids actually
  // present, same shape as the admin-usage split on Expenses.
  const userIds = [...new Set(all.map((r) => r.user_id))];
  const emailById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin.database.from("profiles").select("id,email").in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      emailById.set(p.id, p.email);
    }
  }

  const queue: ContributedQuestionRow[] = all.map((r) => ({
    id: r.id,
    company: r.company,
    companyKey: r.company_key,
    role: r.role,
    question: r.question,
    interviewDate: r.interview_date,
    createdAt: r.created_at,
    status: r.status,
    source: r.source,
    moderatedAt: r.moderated_at,
    moderatedBy: r.moderated_by,
    submitterEmail: emailById.get(r.user_id) ?? null,
  }));

  const counts: Record<ModerationStatus, number> = { pending: 0, published: 0, rejected: 0 };
  for (const r of queue) counts[r.status] += 1;

  // Coverage: AI-generated bank questions vs real contributed ones, per
  // company. Companies appear if EITHER source has anything for them.
  const coverage = new Map<string, CompanyCoverageRow>();
  for (const b of (banks ?? []) as { company: string; questions: unknown }[]) {
    const key = b.company.trim().toLowerCase();
    const existing = coverage.get(key) ?? {
      companyKey: key,
      company: b.company,
      aiQuestionCount: 0,
      contributedCount: 0,
      pendingCount: 0,
    };
    existing.aiQuestionCount += countQuestions(b.questions);
    coverage.set(key, existing);
  }
  for (const r of queue) {
    const key = (r.companyKey || r.company).trim().toLowerCase();
    const existing = coverage.get(key) ?? {
      companyKey: key,
      company: r.company,
      aiQuestionCount: 0,
      contributedCount: 0,
      pendingCount: 0,
    };
    if (r.status === "published") existing.contributedCount += 1;
    if (r.status === "pending") existing.pendingCount += 1;
    coverage.set(key, existing);
  }

  // Volume over the window — published + pending, since both represent a
  // real person submitting something; rejected ones are excluded so a spam
  // burst doesn't read as contribution health.
  const since = daysAgoIso(VOLUME_DAYS - 1);
  const byDay = new Map<string, number>();
  for (const r of queue) {
    if (r.status === "rejected") continue;
    const day = r.createdAt.slice(0, 10);
    if (day < since) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const volume: { date: string; count: number }[] = [];
  for (let i = VOLUME_DAYS - 1; i >= 0; i--) {
    const date = daysAgoIso(i);
    volume.push({ date, count: byDay.get(date) ?? 0 });
  }

  return {
    queue,
    counts,
    coverage: [...coverage.values()].sort(
      (a, b) => b.pendingCount - a.pendingCount || b.contributedCount - a.contributedCount || b.aiQuestionCount - a.aiQuestionCount,
    ),
    volume,
    windowDays: VOLUME_DAYS,
  };
}
