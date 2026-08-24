import { NextResponse } from "next/server";

import { checkPublicAtsScore } from "@/lib/publicAtsChecker";
import { checkIpRateLimit, getClientIp } from "@/lib/ipRateLimit";

// Free ATS score checker (build-plan.md §I) — the first genuinely public,
// unauthenticated, AI-calling route in this app. Route Handler rather than
// a Server Action specifically to read the real client IP off request
// headers for rate limiting. No requireUser() anywhere on this path by
// design.
const ROUTE_KEY = "ats-check";
const MAX_PER_DAY = 3;
const MIN_RESUME_LENGTH = 100;
const MAX_RESUME_LENGTH = 20000;

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const rateLimitResult = await checkIpRateLimit(ip, ROUTE_KEY, MAX_PER_DAY);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ success: false, error: rateLimitResult.error }, { status: 429 });
  }

  let body: { resumeText?: string; jobDescriptionText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const resumeText = (body.resumeText ?? "").trim();
  const jobDescriptionText = (body.jobDescriptionText ?? "").trim();

  if (resumeText.length < MIN_RESUME_LENGTH) {
    return NextResponse.json({ success: false, error: "Paste more of your resume — that looks too short to analyze." }, { status: 400 });
  }
  if (resumeText.length > MAX_RESUME_LENGTH) {
    return NextResponse.json({ success: false, error: "That's too long — please paste just the resume text." }, { status: 400 });
  }

  try {
    const result = await checkPublicAtsScore(resumeText, jobDescriptionText.length > 0 ? jobDescriptionText : null);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[api/tools/ats-check]", error);
    return NextResponse.json({ success: false, error: "Failed to analyze this resume — please try again." }, { status: 500 });
  }
}
