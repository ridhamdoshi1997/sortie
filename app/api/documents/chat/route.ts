import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { reviseCoverLetter, reviseTailoredResume, type ChatMessage } from "@/agent/documents";
import { resolveModelForUser } from "@/lib/subscription";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { getModel } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { toUserMessage } from "@/lib/errors";
import { stripLeadingGreeting } from "@/lib/coverLetterText";
import { buildDefaultStyle, mergeGeneratedContent } from "@/lib/resumeSections";
import type { GeneratedContent } from "@/components/documents/ResumePDF";
import { rescoreAgainstTailoredResume, type ScoreJumpResult } from "@/lib/scoreJump";
import type { Job, Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type RequestBody = {
  jobId?: unknown;
  kind?: unknown;
  messages?: unknown;
};

type DocumentJobRow = Pick<
  Job,
  | "id"
  | "user_id"
  | "title"
  | "company"
  | "about_role"
  | "matched_skills"
  | "missing_skills"
  | "company_research"
>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string",
    )
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isFeatureEnabled("document_generation")) {
      return NextResponse.json(
        { success: false, error: featureDisabledMessage("document_generation") },
        { status: 503 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    const kind = body.kind === "resume" || body.kind === "cover_letter" ? body.kind : null;

    if (!jobId || !isUuid(jobId)) {
      return NextResponse.json(
        { success: false, error: "jobId is required" },
        { status: 400 },
      );
    }
    if (!kind) {
      return NextResponse.json(
        { success: false, error: "kind must be 'resume' or 'cover_letter'" },
        { status: 400 },
      );
    }
    if (!isValidMessages(body.messages)) {
      return NextResponse.json(
        { success: false, error: "messages is required" },
        { status: 400 },
      );
    }
    // Only the NEWEST instruction is taken from the client. The conversation
    // before it is read back from document_chat_messages further down, so a
    // refreshed page still revises with memory of earlier turns, and a client
    // cannot put words in the assistant's mouth.
    const latest = body.messages[body.messages.length - 1];
    if (latest.role !== "user" || !latest.content.trim()) {
      return NextResponse.json(
        { success: false, error: "The last message must be your instruction." },
        { status: 400 },
      );
    }
    const latestText = latest.content.trim().slice(0, 4000);

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/chat");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select(
        "id,user_id,title,company,about_role,matched_skills,missing_skills,company_research",
      )
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<DocumentJobRow>();

    if (jobError) {
      console.error("[api/documents/chat] fetch job", jobError);
      return NextResponse.json(
        { success: false, error: "Failed to load job" },
        { status: 500 },
      );
    }
    if (!job || !job.company_research) {
      return NextResponse.json(
        { success: false, error: "Company research is required before revising a document" },
        { status: 404 },
      );
    }

    const { data: profile, error: profileError } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      console.error("[api/documents/chat] fetch profile", profileError);
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 },
      );
    }

    // Never trust client-sent document content — re-fetch what's actually
    // saved so a revision always builds on the real current state.
    const contentColumn = kind === "resume" ? "generated_resume" : "generated_cover_letter";
    const { data: application, error: applicationError } = await insforge.database
      .from("applications")
      .select(`${contentColumn},resume_sections,resume_style,cover_letter_salutation`)
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<{
        generated_resume?: string | null;
        generated_cover_letter?: string | null;
        resume_sections: ResumeSection[] | null;
        resume_style: ResumeStyle | null;
        cover_letter_salutation: string | null;
      }>();

    const currentContentText = application?.[contentColumn as "generated_resume" | "generated_cover_letter"];
    if (applicationError || !currentContentText) {
      return NextResponse.json(
        {
          success: false,
          error: "No document has been generated yet — generate one first before revising it.",
        },
        { status: 404 },
      );
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, profile.email, "document_generation");
    if (!usage.allowed) {
      // Forward the WHOLE limit result, not just its message.
      //
      // checkAndConsumeUsage already computes `canUpgrade` (is there a plan
      // above this one that grants more of this action) and `resetsAt`, and
      // LimitReachedModal already exists and is used by search, email lookup
      // and insider connections. This route dropped all of it and returned a
      // bare string, so the entire résumé surface — Action Plan, Quick
      // Tweaks, the framework bar — showed a plain red error where every
      // other capped feature shows a real upgrade prompt.
      return NextResponse.json(
        {
          success: false,
          error: usage.error,
          ...("reason" in usage ? { reason: usage.reason } : {}),
          ...("resetsAt" in usage ? { resetsAt: usage.resetsAt } : {}),
          ...("canUpgrade" in usage ? { canUpgrade: usage.canUpgrade } : {}),
        },
        { status: 429 },
      );
    }

    // The saved thread, newest 20, oldest first. If that read fails the
    // client's own copy is the fallback — a revision with slightly less
    // context beats refusing the user's instruction.
    const HISTORY_TURNS = 20;
    const { data: historyRows, error: historyError } = await insforge.database
      .from("document_chat_messages")
      .select("role,content")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS);
    if (historyError) console.error("[api/documents/chat] load chat history", historyError);
    const history: ChatMessage[] = historyError
      ? body.messages.slice(0, -1).slice(-HISTORY_TURNS)
      : ((historyRows ?? []) as ChatMessage[]).reverse();
    const messages: ChatMessage[] = [...history, { role: "user", content: latestText }];

    const dossier = job.company_research;
    const { provider, tier } = await resolveModelForUser(insforge, user.id, profile.email, profile.preferred_model);
    let generatedContentText: string;
    let reply: string;
    // Only set for kind === "resume" — re-saved after persistGeneratedDocument
    // below, same pattern as /api/documents/generate.
    let resumeSections: ResumeSection[] | null = null;
    let resumeStyle: ResumeStyle | null = null;

    if (kind === "resume") {
      const currentContent = JSON.parse(currentContentText) as GeneratedContent;
      const currentStyle = application?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);
      const revised = await reviseTailoredResume({
        job,
        profile,
        dossier,
        provider,
        tier,
        messages,
        currentContent,
        currentStyle,
      });
      reply = revised.reply;
      generatedContentText = JSON.stringify(revised.content);
      resumeSections = mergeGeneratedContent(application?.resume_sections ?? null, revised.content, profile);
      // styleChanges is only non-null when the candidate's latest message
      // was actually about template/theme/layout (agent/documents.ts's
      // reviseTailoredResume) — merged onto the existing style rather than
      // replacing it, so a content-only chat turn never resets style.
      resumeStyle = revised.styleChanges ? { ...currentStyle, ...revised.styleChanges } : currentStyle;
    } else {
      // Shares the résumé's exact style (see CoverLetterPDF.tsx's comment) —
      // already fetched above as part of `application`, no second query.
      const currentCoverLetterStyle = application?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);
      const revised = await reviseCoverLetter({
        job,
        profile,
        dossier,
        provider,
        tier,
        messages,
        currentContent: currentContentText,
        currentStyle: currentCoverLetterStyle,
      });
      reply = revised.reply;
      // The salutation is its own field; never store a second one in the body.
      generatedContentText = stripLeadingGreeting(revised.content);
      // styleChanges only non-null when the latest message was actually
      // about template/theme/layout — merged onto the existing shared
      // style, same rule reviseTailoredResume's own branch above follows.
      // Saved into the outer `resumeStyle` (despite the résumé-flavored
      // name) so the shared persist block below picks it up — it already
      // guards on `resumeSections && resumeStyle`, and resumeSections stays
      // null here, so this can't accidentally trigger the résumé-only
      // rescore path, only the style column write it shares with it.
      const coverLetterStyle = revised.styleChanges
        ? { ...currentCoverLetterStyle, ...revised.styleChanges }
        : currentCoverLetterStyle;
      if (revised.styleChanges) {
        resumeStyle = coverLetterStyle;
      }
    }

    // A chat turn EDITS the document; it does not publish a PDF.
    //
    // This used to render a full PDF with renderToBuffer and upload it to
    // storage on every single revision — including a one-word tweak from an
    // Action Plan chip. That was wrong three ways, and the user called it
    // out directly: "when user press any prompt or give any instruction
    // through chat, you only change in the editor, once user makes the
    // changes to save or something similar then only you generate the
    // resume."
    //
    //   1. It put a slow PDF render and a remote upload on the hot path of
    //      every tweak. That upload is exactly where the observed
    //      ECONNRESET happened, so a transient socket reset could destroy a
    //      revision the AI had already been paid for.
    //   2. It archived a version of the PREVIOUS document every time, so
    //      three Action Plan clicks left three permanent archived PDFs plus
    //      three version rows, uncapped, against a 500 MB storage budget.
    //   3. It was redundant. The editor's live preview renders the PDF
    //      client-side from these same sections, so the user already sees
    //      the result instantly with no server round trip.
    //
    // The durable state is resume_sections/resume_style, saved below — the
    // PDF is a DERIVED ARTIFACT, now produced on demand at download time
    // (app/api/documents/download) from exactly this saved state. Manual
    // editor edits already worked this way via saveResumeSections; this
    // makes the chat path consistent with them instead of special.
    const modelUsed = (await getModel(provider, tier)).model;

    // persistGeneratedDocument used to own writing the content column; with
    // the PDF step gone, that write moves here. Without it the NEXT chat
    // turn would read a stale generated_resume and silently revise the
    // pre-revision document — losing the user's last instruction.
    const contentColumnToWrite = kind === "resume" ? "generated_resume" : "generated_cover_letter";

    let scoreJump: ScoreJumpResult | null = null;
    if (resumeSections && resumeStyle) {
      const { error: sectionsError } = await insforge.database
        .from("applications")
        .update({
          [contentColumnToWrite]: generatedContentText,
          ai_model_used: modelUsed,
          resume_sections: resumeSections,
          resume_style: resumeStyle,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("job_id", jobId);
      if (sectionsError) {
        console.error("[api/documents/chat] save resume_sections/resume_style", sectionsError);
      }
      scoreJump = await rescoreAgainstTailoredResume(insforge, user.id, jobId, profile, resumeSections, provider, tier);
    } else {
      // Cover letter: same content write, plus the shared style column only
      // when this turn actually changed style.
      const { error: letterError } = await insforge.database
        .from("applications")
        .update({
          [contentColumnToWrite]: generatedContentText,
          ai_model_used: modelUsed,
          ...(resumeStyle ? { resume_style: resumeStyle } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("job_id", jobId);
      if (letterError) {
        console.error("[api/documents/chat] save cover-letter content/style", letterError);
      }
    }

    // Saved only after the revision itself is written, so the history never
    // records an instruction that did not happen. Explicit timestamps keep
    // the pair in order — one insert gives both rows the same now().
    const turnAt = Date.now();
    const { error: chatSaveError } = await insforge.database.from("document_chat_messages").insert([
      { user_id: user.id, job_id: jobId, kind, role: "user", content: latestText, created_at: new Date(turnAt).toISOString() },
      {
        user_id: user.id,
        job_id: jobId,
        kind,
        role: "assistant",
        content: (reply.trim() || "Done.").slice(0, 8000),
        created_at: new Date(turnAt + 1).toISOString(),
      },
    ]);
    if (chatSaveError) console.error("[api/documents/chat] save chat history", chatSaveError);

    revalidatePath(`/find-jobs/${jobId}`);
    revalidatePath(`/resume/tailored/${jobId}`);
    revalidatePath(`/cover-letter/tailored/${jobId}`);

    return NextResponse.json({
      success: true,
      data: {
        reply,
        // No pdfUrl any more — a chat turn no longer publishes a file. The
        // download route renders from the saved sections on demand, so the
        // client has nothing to point at and nothing to invalidate.
        scoreJump,
        sections: resumeSections,
        style: resumeStyle,
        // Only set for kind === "cover_letter" — CoverLetterWorkspace's own
        // local `letterBody` state has no other way to pick up a chat
        // revision (router.refresh() alone doesn't push new data into an
        // already-initialized useState, same reasoning as `sections` above).
        letterBody: kind === "cover_letter" ? generatedContentText : undefined,
      },
    });
  } catch (error) {
    console.error("[api/documents/chat]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
