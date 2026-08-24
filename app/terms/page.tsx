import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const EFFECTIVE_DATE = "August 17, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-6 text-text-secondary">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Terms & Conditions</h1>
          <p className="mt-2 text-sm text-text-muted">Effective {EFFECTIVE_DATE}</p>
        </div>

        <Section title="1. What Sortie is">
          <p>
            Sortie is a job-search assistant: it helps you find, evaluate, and prepare materials for
            job opportunities using AI. It is a tool you direct — it does not act on your behalf
            without your explicit confirmation (we do not auto-apply to jobs for you).
          </p>
        </Section>

        <Section title="2. Your account">
          <p>
            You&apos;re responsible for the accuracy of the information you provide (résumé, work
            history, profile details) and for keeping your account credentials secure. You must be at
            least 16 years old to use Sortie.
          </p>
        </Section>

        <Section title="3. AI-generated content">
          <p>
            Résumés, cover letters, interview questions, company research, and other AI-generated
            content are predictions and drafts, not guarantees of accuracy or outcomes. Interview
            questions are AI-predicted, not sourced from real leaked interviews. You are responsible
            for reviewing anything Sortie generates before using it — for an application, an interview,
            or any other purpose.
          </p>
        </Section>

        <Section title="4. Fair use">
          <p>
            AI and data-lookup features carry real usage limits per account (shown in the product) to
            keep the service available and sustainable. Attempting to circumvent these limits, scrape
            the service, or use it to build a competing product is not permitted.
          </p>
        </Section>

        <Section title="5. What we don't allow">
          <ul className="list-disc space-y-2 pl-5">
            <li>Automating applications through Sortie or using it to spam employers.</li>
            <li>Uploading someone else&apos;s personal data without their consent.</li>
            <li>Attempting to access another user&apos;s account or data.</li>
          </ul>
        </Section>

        <Section title="6. Termination">
          <p>
            You may delete your account at any time from Settings — this permanently removes your data.
            We may suspend accounts that violate these terms.
          </p>
        </Section>

        <Section title="7. Disclaimer">
          <p>
            Sortie is provided &quot;as is.&quot; We don&apos;t guarantee job-search outcomes, interview results,
            or that any AI-generated content is error-free. Company and compensation data (where shown)
            is sourced or estimated and may not be current or fully accurate.
          </p>
        </Section>

        <Section title="8. Changes">
          <p>We may update these terms as the product changes; the effective date above will reflect the latest revision.</p>
        </Section>

        <Section title="9. Contact">
          <p>Questions about these terms — reach us via the account email associated with this project.</p>
        </Section>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
