import { NextRequest, NextResponse } from "next/server";

import { findEmailForPerson } from "@/agent/research";
import { getCurrentUser } from "@/lib/auth";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { createInsforgeServer } from "@/lib/insforge-server";

type RequestBody = {
  firstName?: unknown;
  lastName?: unknown;
  companyLinkedinUrl?: unknown;
};

// Filter-based, not URL-based — HarvestAPI's search actor (the vendor
// already used for Insider Connections) can't look up an arbitrary pasted
// LinkedIn URL directly, only search by name + company. This only reveals
// email for a person already surfaced through the connections search
// (where their name and the job's resolved company URL are already known),
// not a standalone "paste any profile" lookup — see agent/research.ts's
// findEmailForPerson for the full explanation.
//
// Never persisted — displayed once for the candidate to copy, then discarded.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isFeatureEnabled("company_research")) {
      return NextResponse.json(
        { success: false, error: featureDisabledMessage("company_research") },
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
    const userId = user.id;

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const companyLinkedinUrl =
      typeof body.companyLinkedinUrl === "string" ? body.companyLinkedinUrl.trim() : "";

    if (!firstName || !lastName || !companyLinkedinUrl) {
      return NextResponse.json(
        { success: false, error: "firstName, lastName, and companyLinkedinUrl are required" },
        { status: 400 },
      );
    }

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, userId, user.email, "documents/email");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const usage = await checkAndConsumeUsage(insforge, userId, user.email, "email_lookup");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    const result = await findEmailForPerson(firstName, lastName, companyLinkedinUrl);

    if (!result.success) {
      const status = result.error === "Email lookup is not configured." ? 503 : 500;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      data: { email: result.email, name: result.name },
    });
  } catch (error) {
    console.error("[api/documents/email]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
