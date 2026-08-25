import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { ExternalJobForm } from "@/components/jobs/ExternalJobForm";

export default async function ExternalJobPage() {
  await requireUser();

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">External</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Paste a job posting from anywhere and get the same match evaluation.
          </p>
        </div>

        <ExternalJobForm />
      </main>
    </>
  );
}
