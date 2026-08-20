"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { calculateCompletion } from "@/lib/profile-utils";
import { trackPostHogEvent } from "@/lib/posthog-server";
import type { ExtractedProfile } from "@/actions/profile";
import type { Education, WorkExperience } from "@/types";

type CompleteOnboardingInput = {
  jobTitlesSeeking: string[];
  workAuthorization: string | null;
  experienceLevel: string | null;
  acquisitionChannel: string | null;
  extracted: ExtractedProfile | null;
};

type ActionResult = { success: boolean; error?: string; redirectTo?: "/dashboard" | "/profile" };

// The onboarding wizard's own picks (target roles, seniority, work auth)
// always win over whatever the AI extractor separately guessed for those
// same fields — a resume's inferred "seniority" is a guess, the user's own
// explicit selection in the wizard is ground truth.
export async function completeOnboarding(input: CompleteOnboardingInput): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const extracted = input.extracted;

    const workExperience: WorkExperience[] = extracted?.work_experience ?? [];
    const education: Education[] = extracted?.education ?? [];

    const { isComplete } = calculateCompletion({
      full_name: extracted?.full_name ?? null,
      phone: extracted?.phone ?? null,
      location: extracted?.location ?? null,
      current_title: extracted?.current_title ?? null,
      experience_level: input.experienceLevel ?? extracted?.experience_level ?? null,
      years_experience: extracted?.years_experience ?? null,
      skills: extracted?.skills ?? [],
      work_experience: workExperience,
      education,
    });

    const profileFields = {
      full_name: extracted?.full_name ?? null,
      phone: extracted?.phone ?? null,
      location: extracted?.location ?? null,
      current_title: extracted?.current_title ?? null,
      experience_level: input.experienceLevel ?? extracted?.experience_level ?? null,
      years_experience: extracted?.years_experience ?? null,
      skills: extracted?.skills ?? [],
      industries: extracted?.industries ?? [],
      work_experience: workExperience,
      education,
      certifications: extracted?.certifications ?? [],
      job_titles_seeking: input.jobTitlesSeeking,
      linkedin_url: extracted?.linkedin_url ?? null,
      portfolio_url: extracted?.portfolio_url ?? null,
      work_authorization: input.workAuthorization,
      acquisition_channel: input.acquisitionChannel,
      onboarding_completed_at: new Date().toISOString(),
      is_complete: isComplete,
    };

    const { data: updated, error } = await insforge.database
      .from("profiles")
      .update(profileFields)
      .eq("id", user.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("[actions/onboarding] completeOnboarding", error);
      return { success: false, error: "Failed to save your setup" };
    }

    // Same self-heal as actions/profile.ts's saveProfile — a profiles row is
    // normally provisioned by the on_auth_user_created trigger, but this
    // guards against that ever not firing.
    if (!updated) {
      const { error: insertError } = await insforge.database
        .from("profiles")
        .insert([{ id: user.id, ...profileFields }]);

      if (insertError) {
        console.error("[actions/onboarding] completeOnboarding insert fallback", insertError);
        return { success: false, error: "Failed to save your setup" };
      }
    }

    if (isComplete) {
      await trackPostHogEvent({ event: "profile_completed", properties: { userId: user.id } });
    }

    return { success: true, redirectTo: isComplete ? "/dashboard" : "/profile" };
  } catch (error) {
    console.error("[actions/onboarding] completeOnboarding", error);
    return { success: false, error: "Failed to save your setup" };
  }
}
