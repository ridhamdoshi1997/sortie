export const dynamic = "force-dynamic";

import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileAttentionBanner } from "@/components/profile/ProfileAttentionBanner";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { calculateCompletion } from "@/lib/profile-utils";
import type { Profile } from "@/types";

export default async function ProfilePage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const { completionPercent, missingFields } = calculateCompletion({
    full_name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    location: profile?.location ?? null,
    current_title: profile?.current_title ?? null,
    experience_level: profile?.experience_level ?? null,
    years_experience: profile?.years_experience ?? null,
    skills: profile?.skills ?? [],
    work_experience: profile?.work_experience ?? null,
    education: profile?.education ?? null,
  });

  return (
    <>
      <PostHogIdentify userId={user.id} />
      <Navbar isAuthenticated />
      {/* Inline width, not just Tailwind's flex/mx-auto/max-w classes — this
         page's <main> was empirically confirmed (via live computed-width
         checks) to be shrink-wrapping to whichever tab's content is
         currently widest, meaning `body`'s flex-col stretch (app/layout.tsx)
         isn't reliably reaching this element under this build. Same fix
         class already proven to work for Tabs.tsx's tabpanel. */}
      <main
        className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
        style={{ width: "100%" }}
      >
        <ProfileAttentionBanner
          completionPercent={completionPercent}
          missingFields={missingFields}
        />
        <ProfileForm profile={profile ?? null} />
      </main>
    </>
  );
}
