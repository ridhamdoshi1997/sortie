export type MissingField =
  | "FULL NAME"
  | "PHONE"
  | "LOCATION"
  | "JOB TITLE"
  | "EXPERIENCE LEVEL"
  | "YEARS EXP"
  | "SKILLS"
  | "WORK EXPERIENCE"
  | "EDUCATION";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  experience_level: string | null;
  years_experience: number | null;
  skills: string[];
  industries: string[];
  work_experience: WorkExperience[] | null;
  education: Education[] | null;
  certifications: string[];
  job_titles_seeking: string[];
  remote_preference: string | null;
  preferred_locations: string[];
  salary_expectation: string | null;
  cover_letter_tone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  work_authorization: string | null;
  preferred_model: "gemini" | "openai" | "anthropic" | null;
  preferred_resume_theme: "classic" | "modern" | "minimal" | null;
  resume_pdf_url: string | null;
  linkedin_context_id: string | null;
  linkedin_connected: boolean;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  responsibilities: string;
}

export interface Education {
  degree: string | null;
  field: string | null;
  institution: string | null;
  graduation_year: string | null;
}

export interface AgentRun {
  id: string;
  user_id: string;
  status: "running" | "completed" | "failed";
  job_title_searched: string | null;
  location_searched: string | null;
  jobs_found: number;
  started_at: string;
  completed_at: string | null;
}

export interface Job {
  id: string;
  run_id: string | null;
  user_id: string;
  source: "search" | "url";
  source_url: string | null;
  external_apply_url: string | null;
  // Not part of the original migration's schema — this is what the actual
  // scraper (lib/actions/scraper.actions.ts) writes the job link to.
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  about_role: string | null;
  responsibilities: string[];
  requirements: string[];
  nice_to_have: string[];
  benefits: string[];
  hiring_process: string[];
  // Extracted from the posting text itself, same zero-marginal-cost pattern
  // as responsibilities/benefits — only ever populated for jobs evaluated
  // from 2026-07-27 onward, older rows stay null (no backfill).
  seniority_level: string | null;
  years_experience_required: string | null;
  // Google Jobs' own resolved logo (SerpApi's `thumbnail` field) — real
  // data, not a domain guess. Only present for jobs found via search from
  // 2026-07-27 onward; JobResultCard falls back to a guessed-domain lookup
  // when this is null (external/manually-added jobs, or older ones).
  company_logo_url: string | null;
  about_company: string | null;
  match_score: number | null;
  match_reason: string | null;
  matched_skills: string[];
  missing_skills: string[];
  evaluation: JobEvaluationDimension[] | null;
  recommendation_score: number | null;
  overall_grade: "A" | "B" | "C" | "D" | "F" | null;
  // Bait-and-Switch Risk Scorer — see lib/evaluator.ts's titleScopeMismatch
  // field comment. Null for jobs evaluated before this feature shipped.
  title_scope_mismatch: { flagged: boolean; note: string } | null;
  cover_letter: string | null;
  tailored_resume_url: string | null;
  tailored_match_score: number | null;
  is_tailored: boolean;
  company_research: CompanyResearchDossier | null;
  resume_analysis: ResumeGapAnalysisResult | null;
  is_saved: boolean;
  is_hidden: boolean;
  // Kanban card research (agy, 2026-08-17) — a user-toggled flag for "the
  // ones I actually need to follow up on" within a crowded column.
  is_priority: boolean;
  application_status: "draft" | "applied" | "interviewing" | "offered" | "rejected";
  // Set whenever application_status changes (actions/jobs.ts's
  // setApplicationStatus) — powers the Kanban board's "days in this stage"
  // and is the real timing input lib/rejectionIntelligence.ts needs. Null
  // for any job whose status has never been changed via the tracker.
  application_status_updated_at: string | null;
  // AI diagnosis of why an employer likely went silent — see
  // lib/rejectionIntelligence.ts's header comment on why this is always
  // framed as "possible explanations," never a real answer. Local shape
  // mirroring lib/rejectionIntelligence.ts's RejectionDiagnosisResult
  // (not imported, same precedent as JobEvaluationDimension above, since
  // lib/rejectionIntelligence.ts itself imports from lib/evaluator.ts,
  // which would create a circular import back into this file).
  rejection_diagnosis: RejectionDiagnosis | null;
  rejection_diagnosed_at: string | null;
  // Recent-news/strategic-priorities lens on the company — see
  // agent/research.ts's researchStrategicMoat.
  strategic_moat: {
    strategicPriorities: string[];
    existentialThreats: string[];
    smartQuestions: string[];
    sources: string[];
  } | null;
  strategic_moat_researched_at: string | null;
  posted_at: string | null;
  found_at: string;
  // "Is this listing still around?" signals — see lib/jobStatus.ts's
  // getListingSignal. Both null means no signal yet, not "confirmed active."
  marked_unavailable_at: string | null;
  dropped_from_search_at: string | null;
  // Equity & Cap Table Decoder — user-entered offer numbers, no funding-data
  // lookup involved. Local shape mirroring lib/equityDecoder.ts's
  // OfferDetails (not imported, kept consistent with the rest of this file's
  // circular-import precedent even though equityDecoder.ts itself has no
  // deps — see context/build-plan.md §M).
  offer_details: OfferDetails | null;
  offer_details_updated_at: string | null;
  // Post-Offer Leverage Synthesizer — grounded only in this job's own
  // already-stored data, see lib/leverageSynthesizer.ts's header comment.
  // Local shape mirroring its LeverageSynthesisResult, same
  // avoid-circular-import precedent as rejection_diagnosis above (it also
  // imports lib/evaluator.ts).
  leverage_synthesis: LeverageSynthesis | null;
  leverage_synthesized_at: string | null;
  // Trap Door Predictor — tough/uncomfortable questions grounded only in
  // this job's own already-stored research, see lib/trapDoorPredictor.ts's
  // header comment. Local shape mirroring its TrapDoorPredictionResult.
  trap_door_predictions: {
    predictions: {
      question: string;
      category: "instability_signal" | "demanding_culture" | "scope_ambiguity" | "strategy_shift" | "unclear_from_available_data";
      whyLikely: string;
    }[];
    confidenceNote: string;
  } | null;
  trap_door_predicted_at: string | null;
  // The Interrogation Plan — questions to ASK the interviewers, synthesized
  // from strategic_moat + interview_panel_members, see
  // lib/interrogationPlan.ts's header comment. Local shape mirroring its
  // InterrogationPlanResult.
  interrogation_plan: {
    generalQuestions: string[];
    perInterviewer: { name: string; questions: string[]; rationale: string }[];
  } | null;
  interrogation_plan_generated_at: string | null;
  // Salary Tax & Take-Home Calculator inputs — see lib/taxCalculator.ts's
  // header comment for scope/accuracy caveats. Same avoid-circular-import
  // precedent as OfferDetails above (taxCalculator.ts itself has no deps
  // either, kept as a local mirror for consistency with this file).
  tax_estimate_inputs: TaxEstimateInputs | null;
  tax_estimate_inputs_updated_at: string | null;
  // User-authored tracker metadata — plain CRUD, no AI. tags mirrors
  // accomplishments.tags's array shape.
  tags: string[];
  personal_notes: string | null;
}

export interface JobEvaluationDimension {
  dimension: string;
  grade: "A" | "B" | "C" | "D" | "F";
  note: string;
}

export interface RejectionDiagnosis {
  possibleReasons: {
    category:
      | "skills_gap"
      | "seniority_mismatch"
      | "compensation_mismatch"
      | "market_conditions"
      | "application_volume"
      | "unclear_from_available_data";
    explanation: string;
  }[];
  suggestedNextAction: string;
  confidenceNote: string;
}

export interface OfferDetails {
  baseSalary: number | null;
  signingBonus: number | null;
  annualBonusTarget: number | null;
  equityType: "rsu" | "iso" | "nso" | "none";
  numberOfShares: number | null;
  strikePrice: number | null;
  currentFmv: number | null;
  totalSharesOutstanding: number | null;
  vestingYears: number | null;
  cliffMonths: number | null;
}

export interface LeverageSynthesis {
  leverageLevel: "strong" | "moderate" | "limited" | "unclear";
  factors: { label: string; explanation: string }[];
  talkingPoints: string[];
  confidenceNote: string;
}

export interface TaxEstimateInputs {
  country: "us" | "ca";
  annualGrossIncome: number | null;
  usState: import("@/lib/taxCalculator").USState | null;
  caProvince: import("@/lib/taxCalculator").CAProvince | null;
}

// Whole-résumé quality analysis (distinct from ResumeGapAnalysisResult below,
// which is résumé-vs-one-specific-job). Reuses JobEvaluationDimension's
// {dimension, grade, note} shape for the 10-dimension role-fit matrix, since
// it's the same "letter grade + one-line reason" pattern the job evaluator
// already established — no need for a second shape that means the same
// thing. See context/jobright-resume-scan-2026-07-30.md for the reference
// this was designed against (grade tiers, urgent/critical/optional counts,
// per-bullet issue+diff+rewrite pattern) and the chat flow-design pass for
// why narrative alignment and vulnerabilities are separate from the
// dimension grid rather than two more dimensions bolted on.
export type ResumeIssueSeverity = "urgent" | "critical" | "optional";

export interface ResumeBulletIssue {
  // Matches the bullet verbatim against work_experience[entryIndex]'s
  // responsibilities (split the same way BulletEditor/splitIntoBullets
  // already does) — index-based would break the moment a bullet is
  // reordered or another one is added/removed above it.
  originalText: string;
  issueType: string;
  issueDetected: string;
  whyItMatters: string;
  howToImprove: string;
  suggestedRewrite: string;
}

export interface ResumeSectionAnalysis {
  section: "personal" | "professional_summary" | "skills" | "work_experience" | "education";
  // Only present for work_experience — which of the profile's entries this
  // targets, matched by company name (stable across re-analysis; an array
  // index isn't, since a user can add/remove/reorder roles between runs).
  entryCompany?: string;
  severity: ResumeIssueSeverity;
  issueCount: number;
  bulletIssues: ResumeBulletIssue[];
}

export interface ResumeVulnerability {
  title: string;
  description: string;
}

export interface ResumeAnalysis {
  grade: "A" | "B" | "C" | "D" | "F";
  gradeLabel: "Excellent" | "Good" | "Satisfactory" | "Improvable";
  summary: string;
  urgentCount: number;
  criticalCount: number;
  optionalCount: number;
  // The 10-dimension role-fit matrix — the report's main body, replacing
  // JobRight's generic Relevance/Impact/Style categories with something
  // specific to the résumé's own target role.
  dimensions: JobEvaluationDimension[];
  // Strategic Narrative Alignment: one holistic read of the whole résumé's
  // positioning, not a per-dimension score.
  narrativeInsight: string;
  // Interviewer Skepticism: "expect to be asked about this," not "fix this."
  vulnerabilities: ResumeVulnerability[];
  sections: ResumeSectionAnalysis[];
}

export type GapStatus = "pass" | "warn" | "fail";

export interface GapCheckResult {
  label: string;
  status: GapStatus;
  jobSide: string;
  resumeSide: string;
}

export interface ResumeGapAnalysisResult {
  score: number;
  checks: GapCheckResult[];
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface CompanyLeader {
  name: string;
  title: string;
  // Only ever populated by the paid Apify LinkedIn fallback — Wikipedia and
  // site-guess extraction never have a real profile URL/photo to offer.
  linkedinUrl?: string;
  photoUrl?: string;
}

export interface ConnectionPerson {
  name: string;
  // Kept separately from `name` — the email-reveal lookup searches by
  // first/last name + company (HarvestAPI's actor is filter-based, not
  // URL-based, so a combined display name alone isn't enough to re-query).
  firstName: string;
  lastName: string;
  title: string;
  linkedinUrl?: string;
  photoUrl?: string;
  // Only set on the "previous company" bucket, where it's the actual reason
  // this person is shown at all.
  pastEmployer?: string;
}

export interface InsiderConnections {
  beyondNetwork: ConnectionPerson[];
  previousCompany: ConnectionPerson[];
  school: ConnectionPerson[];
  // The job's resolved LinkedIn company URL, cached here so a later
  // email-reveal click can search "this person's name + this company"
  // without re-resolving the company URL (an extra Apify call) every time.
  companyLinkedinUrl?: string;
}

export interface CompanyResearchDossier {
  companyOverview: string;
  industryTags: string[];
  techStack: string[];
  culture: string[];
  whyThisRole: string;
  yourEdge: string[];
  gapsToAddress: string[];
  smartQuestions: string[];
  interviewPrep: string[];
  // Grounded in whatever the site crawl actually surfaced (blog/press pages),
  // not a real news API — labeled "Recent Updates" in the UI, not "Recent
  // News", so it doesn't overclaim where this came from.
  recentUpdates: string[];
  // Opt-in only (separate button, separate API call) — never populated by
  // the main auto-fetch. Extracting real people's names carries real
  // accuracy risk, so the candidate explicitly asks for it rather than it
  // running silently for every job. See agent/research.ts's
  // researchLeadershipTeam.
  leadershipTeam: CompanyLeader[];
  // Distinguishes "never searched" from "searched, found nothing" — both
  // states leave leadershipTeam as [], which is otherwise indistinguishable
  // in the UI and reads as "the button didn't do anything."
  leadershipLookedUp?: boolean;
  // Same opt-in-only, paid-lookup pattern as leadershipTeam — see
  // agent/research.ts's researchInsiderConnections.
  insiderConnections?: InsiderConnections;
  insiderConnectionsLookedUp?: boolean;
  sources: string[];
}

export interface AgentLog {
  id: string;
  run_id: string | null;
  user_id: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  job_id: string | null;
  created_at: string;
}
