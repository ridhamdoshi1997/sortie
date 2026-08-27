import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/LoginCard";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getCurrentUser, getPostLoginRedirectPath } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    mode?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect(await getPostLoginRedirectPath(user.id));
  }

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const defaultMode = rawMode === "signup" ? "signup" : "signin";

  return (
    <>
      <Navbar />
      <main>
        <LoginCard error={error} defaultMode={defaultMode} />
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
