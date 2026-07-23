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
  education: Education | null;
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
  about_company: string | null;
  match_score: number | null;
  match_reason: string | null;
  matched_skills: string[];
  missing_skills: string[];
  evaluation: JobEvaluationDimension[] | null;
  recommendation_score: number | null;
  overall_grade: "A" | "B" | "C" | "D" | "F" | null;
  cover_letter: string | null;
  tailored_resume_url: string | null;
  tailored_match_score: number | null;
  is_tailored: boolean;
  company_research: CompanyResearchDossier | null;
  resume_analysis: ResumeGapAnalysisResult | null;
  is_saved: boolean;
  is_hidden: boolean;
  posted_at: string | null;
  found_at: string;
}

export interface JobEvaluationDimension {
  dimension: string;
  grade: "A" | "B" | "C" | "D" | "F";
  note: string;
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
