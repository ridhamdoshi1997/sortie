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
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold text-text-primary">Settings</h1>
        <SettingsPanel
          email={data.user?.email ?? user.email ?? ""}
          providers={data.user?.providers ?? []}
        />
      </main>
    </>
  );
}
