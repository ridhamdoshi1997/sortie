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

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Privacy Policy</h1>
          <p className="mt-2 text-sm text-text-muted">Effective {EFFECTIVE_DATE}</p>
        </div>

        <p className="text-sm leading-6 text-text-secondary">
          Sortie (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) helps you find, evaluate, and prepare for jobs. This policy
          explains what data we collect, why, who we share it with, and the choices you have. We wrote
          it to describe what this app actually does, not generic boilerplate — if something here
          doesn&apos;t match what you see in the product, tell us.
        </p>

        <Section title="1. What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-text-primary">Account information</span> — your email
              and name, from Google/GitHub sign-in or email/password registration.
            </li>
            <li>
              <span className="font-medium text-text-primary">Profile & career data</span> — work
              history, education, skills, résumé files you upload, and anything you add to your Career
              Record (accomplishments, interview stories, notes).
            </li>
            <li>
              <span className="font-medium text-text-primary">Job search activity</span> — jobs you
              save or search for, our AI&apos;s evaluation of your fit for them, and your application
              status/notes.
            </li>
            <li>
              <span className="font-medium text-text-primary">Conversations with our AI</span> —
              messages you send to document-editing chat or Navigator, our copilot, so we can maintain
              context across a conversation.
            </li>
            <li>
              <span className="font-medium text-text-primary">Named individuals you tell us about</span>{" "}
              — if you enter an interviewer&apos;s name for interview prep, we look up their public
              professional background (e.g. prior employers) to help you prepare. We never discover
              people on our own; you provide the name.
            </li>
            <li>
              <span className="font-medium text-text-primary">Usage data</span> — which features you
              use and how often, to enforce fair-use limits and improve the product (via PostHog
              analytics).
            </li>
          </ul>
        </Section>

        <Section title="2. What we don't do">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              We never submit a job application on your behalf without you clicking submit yourself.
              We deliberately don&apos;t build auto-apply — every AI-suggested action (logging an
              accomplishment, generating a document) requires your explicit confirmation before
              anything changes.
            </li>
            <li>We don&apos;t sell your personal data to third parties.</li>
            <li>We don&apos;t scrape or collect data about you from outside sources without your input.</li>
          </ul>
        </Section>

        <Section title="3. Who we share data with">
          <p>
            We use a small set of service providers to run Sortie. Each only receives the data it needs
            to do its job:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-text-primary">InsForge</span> — our database, file
              storage, and authentication provider. All of your account data is stored here.
            </li>
            <li>
              <span className="font-medium text-text-primary">AI providers (Google Gemini, and
              OpenAI/Anthropic for select accounts)</span> — process your résumé, job, and profile data
              to generate evaluations and documents. We don&apos;t control their data retention beyond
              what they publish in their own policies.
            </li>
            <li>
              <span className="font-medium text-text-primary">SerpApi</span> — powers job search;
              receives your search terms (title, location), not your personal profile.
            </li>
            <li>
              <span className="font-medium text-text-primary">Apify and Perplexity</span> — used only
              for opt-in features (Insider Connections, company/interviewer research) to look up public
              information about companies and named individuals you specify.
            </li>
            <li>
              <span className="font-medium text-text-primary">Vercel</span> — hosts the application.
            </li>
            <li>
              <span className="font-medium text-text-primary">PostHog</span> — product analytics, so we
              know which features are actually used.
            </li>
          </ul>
          <p>We do not sell any of this data, and we don&apos;t share it for third-party advertising.</p>
        </Section>

        <Section title="4. Security">
          <p>
            Every account&apos;s data is isolated at the database level (row-level security) — no other
            user, including us in normal operation, can query your data through the application without
            going through your authenticated session. AI features that cost real money are rate-limited
            per account to prevent abuse.
          </p>
        </Section>

        <Section title="5. Your rights & choices">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-text-primary">Export</span> — download your full Career
              Record at any time from the Career page.
            </li>
            <li>
              <span className="font-medium text-text-primary">Deletion</span> — delete your account and
              all associated data from Settings. This is permanent and cannot be undone.
            </li>
            <li>
              <span className="font-medium text-text-primary">Correction</span> — edit your profile,
              résumé, and career data directly in the app at any time.
            </li>
          </ul>
        </Section>

        <Section title="6. Children">
          <p>Sortie is not directed at, and we do not knowingly collect data from, anyone under 16.</p>
        </Section>

        <Section title="7. Changes to this policy">
          <p>
            If we materially change how we collect or use your data, we&apos;ll update this page and
            change the effective date above.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            Questions about this policy or your data — reach us via the account email associated with
            this project.
          </p>
        </Section>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
