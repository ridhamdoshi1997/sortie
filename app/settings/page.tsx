import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default async function SettingsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();
  const { data } = await insforge.auth.getCurrentUser();

  return (
    <>
      <Navbar isAuthenticated />
      {/* w-full alongside mx-auto/max-w-4xl — body is `flex flex-col`
          (app/layout.tsx), and a flex item's cross-axis auto margins
          disable stretch alignment per the flexbox spec, so without
          w-full this shrink-wraps to its own content's natural width
          instead of filling up to the max-w-4xl cap. Confirmed live: the
          Settings panel below was genuinely changing width per tab
          because SettingsPanel.tsx keeps inactive tabs mounted with
          display:none (not counted in shrink-to-fit sizing), so `main`'s
          width tracked whichever tab happened to be visible. */}
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-display mb-6 text-2xl font-bold text-text-primary">Settings</h1>
        <SettingsPanel
          email={data.user?.email ?? user.email ?? ""}
          providers={data.user?.app_metadata?.providers ?? []}
        />
      </main>
    </>
  );
}
