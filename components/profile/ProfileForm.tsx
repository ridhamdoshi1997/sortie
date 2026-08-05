"use client";

import { useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Contact,
  GraduationCap,
  GripVertical,
  Loader2,
  Plus,
  Split,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { generateBullets, rewriteBullet, saveProfile, splitBullet } from "@/actions/profile";
import type { ExtractedProfile } from "@/actions/profile";
import type { Profile } from "@/types";
import { SectionIcon, SectionModal } from "./SectionModal";
import { Tabs } from "@/components/ui/Tabs";

type WorkExperienceEntry = {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  responsibilities: string;
};

type EducationEntry = {
  degree: string;
  field: string;
  institution: string;
  graduation_year: string;
};

export type ProfileFormHandle = {
  applyExtracted: (data: ExtractedProfile) => void;
};

type Props = {
  profile: Profile | null;
  formRef?: React.Ref<ProfileFormHandle>;
};

const defaultWorkEntry = (): WorkExperienceEntry => ({
  company: "",
  title: "",
  start_date: "",
  end_date: "",
  is_current: false,
  responsibilities: "",
});

const defaultEducationEntry = (): EducationEntry => ({
  degree: "",
  field: "",
  institution: "",
  graduation_year: "",
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();

const EXPERIENCE_LEVELS = ["Junior", "Mid-Level", "Senior", "Lead", "Manager", "Director", "Executive"];
const WORK_AUTH_OPTIONS = ["Citizen", "Permanent Resident", "Work Visa (H1B)", "Work Visa (Other)", "Student Visa (OPT/CPT)", "Requires Sponsorship"];
const DEGREE_OPTIONS = ["High School", "Associate's", "Bachelor's", "Master's", "Ph.D.", "MBA", "Bootcamp / Certificate"];
const REMOTE_OPTIONS = ["Any", "Remote Only", "Hybrid", "On-site"];
const TONE_OPTIONS = ["Professional", "Conversational", "Enthusiastic", "Concise"];

type SectionId = "personal" | "professional" | "education" | "certifications" | "work" | "preferences";

/* ------------------------------- primitives ------------------------------ */

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">
      {children}
    </label>
  );
}

function FormInput({
  placeholder,
  value,
  onChange,
  readOnly,
  type = "text",
  icon: Icon,
}: {
  placeholder?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  type?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface-secondary read-only:bg-surface-secondary read-only:text-text-secondary"
        />
      </div>
    );
  }

  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface-secondary read-only:bg-surface-secondary read-only:text-text-secondary"
    />
  );
}

function FormSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
    >
      {placeholder && (
        <option value="" disabled className="bg-surface text-text-primary">
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-surface text-text-primary">
          {opt}
        </option>
      ))}
    </select>
  );
}

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary"
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-medium text-accent transition-transform hover:scale-105"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-0.5 leading-none hover:text-accent-dark"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Animated popover date picker — replaces two plain native <select>s with a
// single trigger + a month-grid/year-stepper panel, matching the app's own
// click-outside pattern already used by Navbar's nav dropdown, animated via
// tw-animate-css (already a real dependency, see app/globals.css).
//
// The panel renders through a portal into document.body at a computed fixed
// position, NOT as a normal absolutely-positioned child — every real call
// site lives inside SectionModal's `overflow-y-auto` content area, and a
// plain `position: absolute` panel gets visually clipped by that ancestor's
// overflow the moment the trigger sits anywhere but the very top of the
// scroll area, making months look unclickable (confirmed live: it worked
// fine in isolation outside a scroll container, broke inside the real
// modal). Position is computed once on open, not re-synced on scroll —
// an earlier version closed the panel on any `scroll` event to avoid it
// drifting from the trigger, but that self-sabotaged: clicking the trigger
// inside a scrollable container can itself trigger a browser scroll-into-
// view, which fired the very listener meant to close it AFTER opening,
// closing it instantly. Confirmed live via a direct DOM check (the panel
// never existed in the tree after a click) before finding the real cause.
function MonthYearPicker({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const parts = value ? value.split(" ") : ["", ""];
  const selectedMonth = parts[0] ?? "";
  const selectedYear = parts[1] ?? "";

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    selectedYear ? parseInt(selectedYear, 10) : CURRENT_YEAR,
  );
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((o) => !o);
  }

  function pick(month: string) {
    onChange(`${month} ${viewYear}`);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className={value ? "text-text-primary" : "text-text-muted"}>
          {value || placeholder || "Select date"}
        </span>
      </button>

      {open &&
        !disabled &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 z-50 w-64 rounded-xl border border-border bg-surface p-3 shadow-card duration-150 ease-out"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                aria-label="Previous year"
                className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-mono text-sm font-semibold text-text-primary">{viewYear}</span>
              <button
                type="button"
                onClick={() => setViewYear((y) => y + 1)}
                aria-label="Next year"
                className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((m) => {
                const isSelected = m === selectedMonth && String(viewYear) === selectedYear;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pick(m)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-150 hover:scale-105 ${
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "text-text-secondary hover:bg-accent-muted hover:text-accent"
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SummaryCard({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fade-in-up card-interactive-glow w-full rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-lg font-bold text-text-primary">
          <SectionIcon icon={icon} />
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="rounded-lg p-1.5 text-accent transition-all duration-150 hover:scale-110 hover:bg-accent-muted active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M14.166 2.5a1.768 1.768 0 0 1 2.5 2.5L6.25 15.417 2.5 16.25l.833-3.75L13.75 2.083Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

/* --------------------------------- form ---------------------------------- */

export function ProfileForm({ profile, formRef }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);

  // Personal Info
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [email] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile?.portfolio_url ?? "");
  const [workAuth, setWorkAuth] = useState(profile?.work_authorization ?? "");

  // Professional Info
  const [currentTitle, setCurrentTitle] = useState(profile?.current_title ?? "");
  const [experienceLevel, setExperienceLevel] = useState(profile?.experience_level ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    profile?.years_experience != null ? String(profile.years_experience) : "",
  );
  const [skills, setSkills] = useState<string[]>(profile?.skills ?? []);
  const [industries, setIndustries] = useState<string[]>(profile?.industries ?? []);

  // Work Experience
  const [workEntries, setWorkEntries] = useState<WorkExperienceEntry[]>(
    profile?.work_experience?.map((w) => ({
      company: w.company,
      title: w.title,
      start_date: w.start_date,
      end_date: w.end_date ?? "",
      is_current: w.is_current,
      responsibilities: w.responsibilities,
    })) ?? [defaultWorkEntry()],
  );

  // Education
  const [educationEntries, setEducationEntries] = useState<EducationEntry[]>(
    profile?.education?.length
      ? profile.education.map((e) => ({
          degree: e.degree ?? "",
          field: e.field ?? "",
          institution: e.institution ?? "",
          graduation_year: e.graduation_year ?? "",
        }))
      : [defaultEducationEntry()],
  );

  // Certifications
  const [certifications, setCertifications] = useState<string[]>(profile?.certifications ?? []);

  // Job Preferences
  const [jobTitlesSeeking, setJobTitlesSeeking] = useState<string[]>(
    profile?.job_titles_seeking ?? [],
  );
  const [remotePreference, setRemotePreference] = useState(profile?.remote_preference ?? "");
  const [salaryExpectation, setSalaryExpectation] = useState(profile?.salary_expectation ?? "");
  const [preferredLocations, setPreferredLocations] = useState<string[]>(
    profile?.preferred_locations ?? [],
  );
  const [coverLetterTone, setCoverLetterTone] = useState(profile?.cover_letter_tone ?? "");

  useImperativeHandle(formRef, () => ({
    applyExtracted(data: ExtractedProfile) {
      if (data.full_name) setFullName(data.full_name);
      if (data.phone) setPhone(data.phone);
      if (data.location) setLocation(data.location);
      if (data.linkedin_url) setLinkedinUrl(data.linkedin_url);
      if (data.portfolio_url) setPortfolioUrl(data.portfolio_url);
      if (data.current_title) setCurrentTitle(data.current_title);
      if (data.experience_level) setExperienceLevel(data.experience_level);
      if (data.years_experience != null)
        setYearsExperience(String(data.years_experience));
      if (data.skills.length > 0) setSkills(data.skills);
      if (data.industries.length > 0) setIndustries(data.industries);
      if (data.work_experience.length > 0)
        setWorkEntries(
          data.work_experience.map((w) => ({
            company: w.company,
            title: w.title,
            start_date: w.start_date,
            end_date: w.end_date ?? "",
            is_current: w.is_current,
            responsibilities: w.responsibilities,
          })),
        );
      if (data.education.length > 0)
        setEducationEntries(
          data.education.map((e) => ({
            degree: e.degree ?? "",
            field: e.field ?? "",
            institution: e.institution ?? "",
            graduation_year: e.graduation_year ?? "",
          })),
        );
      if (data.certifications.length > 0) setCertifications(data.certifications);
      if (data.job_titles_seeking.length > 0)
        setJobTitlesSeeking(data.job_titles_seeking);
    },
  }));

  function updateWorkEntry<K extends keyof WorkExperienceEntry>(
    index: number,
    key: K,
    value: WorkExperienceEntry[K],
  ) {
    setWorkEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)),
    );
  }

  function addWorkEntry() {
    setWorkEntries((prev) => [...prev, defaultWorkEntry()]);
  }

  function removeWorkEntry(index: number) {
    setWorkEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEducationEntry<K extends keyof EducationEntry>(
    index: number,
    key: K,
    value: EducationEntry[K],
  ) {
    setEducationEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)),
    );
  }

  function addEducationEntry() {
    setEducationEntries((prev) => [...prev, defaultEducationEntry()]);
  }

  function removeEducationEntry(index: number) {
    setEducationEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateWorkBullets(entryIndex: number, bullets: string[]) {
    updateWorkEntry(entryIndex, "responsibilities", bullets.join("\n"));
  }

  // saveProfile persists the whole row atomically (no partial-update
  // endpoint) — every section's "Save changes" calls this same function
  // with everything currently in state, scoped only in the UI by which
  // modal is open. Simpler and safer than standing up per-section actions.
  function saveAll(onSuccess: () => void) {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveProfile({
        fullName,
        phone,
        location,
        linkedinUrl,
        portfolioUrl,
        workAuth,
        currentTitle,
        experienceLevel,
        yearsExperience,
        skills,
        industries,
        workEntries,
        educationEntries,
        certifications,
        jobTitlesSeeking,
        remotePreference,
        salaryExpectation,
        preferredLocations,
        coverLetterTone,
      });

      if (result.success) {
        onSuccess();
      } else {
        setSaveError(result.error ?? "Failed to save profile");
      }
    });
  }

  function closeModal() {
    setEditingSection(null);
    setSaveError(null);
  }

  function handleSectionSave() {
    saveAll(() => setEditingSection(null));
  }

  return (
    <>
      <Tabs
        defaultTabId="personal"
        tabs={[
          {
            id: "personal",
            label: "Personal",
            content: (
              <div className="space-y-6">
                <SummaryCard icon={Contact} title="Personal" onEdit={() => setEditingSection("personal")}>
                  <p className="text-xl font-bold text-text-primary">{fullName || "Your name"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {phone && (
                      <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                        {phone}
                      </span>
                    )}
                    {location && (
                      <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                        {location}
                      </span>
                    )}
                    {linkedinUrl && (
                      <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                        {linkedinUrl}
                      </span>
                    )}
                  </div>
                  {!phone && !location && !linkedinUrl && (
                    <EmptyHint>Add your contact details.</EmptyHint>
                  )}
                </SummaryCard>

                <SummaryCard
                  icon={Briefcase}
                  title="Professional"
                  onEdit={() => setEditingSection("professional")}
                >
                  <p className="text-sm text-text-secondary">
                    {[currentTitle, experienceLevel, yearsExperience && `${yearsExperience} yrs`]
                      .filter(Boolean)
                      .join(" · ") || "Add your current title and experience level."}
                  </p>
                  {skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </SummaryCard>
              </div>
            ),
          },
          {
            id: "education",
            label: "Education",
            content: (
              <div className="space-y-6">
                <SummaryCard
                  icon={GraduationCap}
                  title="Education"
                  onEdit={() => setEditingSection("education")}
                >
                  {educationEntries.some((e) => e.institution || e.degree) ? (
                    <div className="ml-4 space-y-5 border-l-2 border-agent-light pl-4">
                      {educationEntries
                        .filter((e) => e.institution || e.degree)
                        .map((e, i) => (
                          <div
                            key={i}
                            className="fade-in-up relative"
                            style={{ animationDelay: `${i * 80}ms` }}
                          >
                            <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-agent bg-surface" />
                            <p className="text-sm font-semibold text-text-primary">
                              {e.institution || "Institution"}
                            </p>
                            <p className="text-sm text-text-secondary">
                              {[e.degree, e.field].filter(Boolean).join(" in ")}
                              {e.graduation_year ? ` · ${e.graduation_year}` : ""}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyHint>Add your degrees.</EmptyHint>
                  )}
                </SummaryCard>

                <SummaryCard
                  icon={Award}
                  title="Certifications"
                  onEdit={() => setEditingSection("certifications")}
                >
                  {certifications.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {certifications.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <EmptyHint>Optional — add any certifications.</EmptyHint>
                  )}
                </SummaryCard>
              </div>
            ),
          },
          {
            id: "work",
            label: "Work Experience",
            content: (
              <SummaryCard icon={Building2} title="Work Experience" onEdit={() => setEditingSection("work")}>
                {workEntries.some((w) => w.company || w.title) ? (
                  <div className="ml-4 space-y-6 border-l-2 border-agent-light pl-4">
                    {workEntries
                      .filter((w) => w.company || w.title)
                      .map((w, i) => (
                        <div key={i} className="fade-in-up relative" style={{ animationDelay: `${i * 80}ms` }}>
                          <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-agent bg-surface" />
                          <p className="font-mono text-[11px] tabular-nums text-text-muted">
                            {w.start_date || "—"} → {w.is_current ? "Present" : w.end_date || "—"}
                          </p>
                          <p className="text-sm font-semibold text-text-primary">{w.company || "Company"}</p>
                          <p className="text-sm text-text-secondary">{w.title}</p>
                          {w.responsibilities && (
                            <ul className="mt-1.5 space-y-1">
                              {splitIntoBullets(w.responsibilities).map((b, j) => (
                                <li key={j} className="flex gap-2 text-xs leading-5 text-text-muted">
                                  <span className="text-accent">—</span> {b}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <EmptyHint>Add your work history.</EmptyHint>
                )}
              </SummaryCard>
            ),
          },
          {
            id: "preferences",
            label: "Preferences",
            content: (
              <SummaryCard
                icon={SlidersHorizontal}
                title="Preferences"
                onEdit={() => setEditingSection("preferences")}
              >
                <div className="flex flex-wrap gap-2">
                  {remotePreference && (
                    <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                      {remotePreference}
                    </span>
                  )}
                  {salaryExpectation && (
                    <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                      {salaryExpectation}
                    </span>
                  )}
                  {coverLetterTone && (
                    <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                      {coverLetterTone} tone
                    </span>
                  )}
                  {jobTitlesSeeking.map((t) => (
                    <span key={t} className="rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent">
                      {t}
                    </span>
                  ))}
                </div>
                {!remotePreference && !salaryExpectation && jobTitlesSeeking.length === 0 && (
                  <EmptyHint>Set what you&apos;re looking for.</EmptyHint>
                )}
              </SummaryCard>
            ),
          },
        ]}
      />

      {editingSection === "personal" && (
        <SectionModal title="Edit Personal Info" onClose={closeModal} onSave={handleSectionSave} saving={isPending}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FormLabel>Full Name</FormLabel>
              <FormInput placeholder="Jane Smith" value={fullName} onChange={setFullName} />
            </div>
            <div>
              <FormLabel>Email</FormLabel>
              <FormInput value={email} readOnly />
            </div>
            <div>
              <FormLabel>Phone Number</FormLabel>
              <FormInput placeholder="+1 (865) 555-0100" value={phone} onChange={setPhone} />
            </div>
            <div>
              <FormLabel>Location</FormLabel>
              <FormInput placeholder="New York, NY" value={location} onChange={setLocation} />
            </div>
            <div>
              <FormLabel>LinkedIn URL</FormLabel>
              <FormInput placeholder="linkedin.com/in/yourname" value={linkedinUrl} onChange={setLinkedinUrl} />
            </div>
            <div>
              <FormLabel>Portfolio / GitHub</FormLabel>
              <FormInput placeholder="https://github.com/yourname" value={portfolioUrl} onChange={setPortfolioUrl} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Work Authorization</FormLabel>
              <div className="max-w-xs">
                <FormSelect options={WORK_AUTH_OPTIONS} value={workAuth} onChange={setWorkAuth} placeholder="Select..." />
              </div>
            </div>
          </div>
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}

      {editingSection === "professional" && (
        <SectionModal
          title="Edit Professional Info"
          onClose={closeModal}
          onSave={handleSectionSave}
          saving={isPending}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormLabel>Current / Last Job Title</FormLabel>
              <FormInput placeholder="Frontend Engineer" value={currentTitle} onChange={setCurrentTitle} />
            </div>
            <div>
              <FormLabel>Experience Level</FormLabel>
              <FormSelect
                options={EXPERIENCE_LEVELS}
                value={experienceLevel}
                onChange={setExperienceLevel}
                placeholder="Select level..."
              />
            </div>
            <div>
              <FormLabel>Years of Experience</FormLabel>
              <FormInput
                type="number"
                placeholder="4"
                value={yearsExperience}
                onChange={(v) => {
                  if (v === "" || /^\d+$/.test(v)) setYearsExperience(v);
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Skills</FormLabel>
              <TagInput
                tags={skills}
                onAdd={(tag) => setSkills((prev) => [...prev, tag])}
                onRemove={(tag) => setSkills((prev) => prev.filter((s) => s !== tag))}
                placeholder="e.g. React, TypeScript"
              />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Industries Worked in (Optional)</FormLabel>
              <TagInput
                tags={industries}
                onAdd={(tag) => setIndustries((prev) => [...prev, tag])}
                onRemove={(tag) => setIndustries((prev) => prev.filter((i) => i !== tag))}
                placeholder="e.g. FinTech, Healthcare"
              />
            </div>
          </div>
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}

      {editingSection === "education" && (
        <SectionModal title="Edit Education" onClose={closeModal} onSave={handleSectionSave} saving={isPending}>
          <div className="space-y-5">
            {educationEntries.map((entry, index) => (
              <div
                key={index}
                className="relative rounded-xl border border-border bg-surface-secondary/30 p-4 transition-colors duration-150 hover:border-accent/30"
              >
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted font-mono text-[11px] font-bold text-accent">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {entry.institution || entry.degree || `Degree ${index + 1}`}
                  </span>
                  <GripVertical className="ml-auto h-4 w-4 shrink-0 cursor-grab text-text-muted" />
                  {educationEntries.length > 1 && (
                    <>
                      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
                      <button
                        type="button"
                        onClick={() => removeEducationEntry(index)}
                        className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-error"
                        aria-label="Remove this degree"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FormLabel>Degree</FormLabel>
                    <FormSelect
                      options={DEGREE_OPTIONS}
                      value={entry.degree}
                      onChange={(v) => updateEducationEntry(index, "degree", v)}
                      placeholder="Select degree..."
                    />
                  </div>
                  <div>
                    <FormLabel>Field of Study</FormLabel>
                    <FormInput
                      placeholder="Computer Science"
                      value={entry.field}
                      onChange={(v) => updateEducationEntry(index, "field", v)}
                    />
                  </div>
                  <div>
                    <FormLabel>Institution Name</FormLabel>
                    <FormInput
                      icon={GraduationCap}
                      placeholder="e.g. State University"
                      value={entry.institution}
                      onChange={(v) => updateEducationEntry(index, "institution", v)}
                    />
                  </div>
                  <div>
                    <FormLabel>Graduation Year</FormLabel>
                    <FormInput
                      placeholder="YYYY"
                      value={entry.graduation_year}
                      onChange={(v) => updateEducationEntry(index, "graduation_year", v)}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addEducationEntry}
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Add degree
            </button>
          </div>
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}

      {editingSection === "certifications" && (
        <SectionModal
          title="Edit Certifications"
          onClose={closeModal}
          onSave={handleSectionSave}
          saving={isPending}
        >
          <TagInput
            tags={certifications}
            onAdd={(tag) => setCertifications((prev) => [...prev, tag])}
            onRemove={(tag) => setCertifications((prev) => prev.filter((c) => c !== tag))}
            placeholder="e.g. AWS Certified Solutions Architect"
          />
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}

      {editingSection === "work" && (
        <SectionModal
          title="Edit Work Experience"
          onClose={closeModal}
          onSave={handleSectionSave}
          saving={isPending}
        >
          <div className="space-y-5">
            {workEntries.map((entry, index) => (
              <div
                key={index}
                className="relative rounded-xl border border-border bg-surface-secondary/30 p-4 transition-colors duration-150 hover:border-accent/30"
              >
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted font-mono text-[11px] font-bold text-accent">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {entry.title || entry.company || `Role ${index + 1}`}
                  </span>
                  <GripVertical className="ml-auto h-4 w-4 shrink-0 cursor-grab text-text-muted" />
                  {workEntries.length > 1 && (
                    <>
                      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
                      <button
                        type="button"
                        onClick={() => removeWorkEntry(index)}
                        className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-error"
                        aria-label="Remove this role"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FormLabel>Company Name</FormLabel>
                    <FormInput
                      icon={Building2}
                      placeholder="Acme Inc."
                      value={entry.company}
                      onChange={(v) => updateWorkEntry(index, "company", v)}
                    />
                  </div>
                  <div>
                    <FormLabel>Job Title</FormLabel>
                    <FormInput
                      icon={Briefcase}
                      placeholder="Frontend Engineer"
                      value={entry.title}
                      onChange={(v) => updateWorkEntry(index, "title", v)}
                    />
                  </div>
                  <div>
                    <FormLabel>Start Date</FormLabel>
                    <MonthYearPicker value={entry.start_date} onChange={(v) => updateWorkEntry(index, "start_date", v)} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <FormLabel>End Date</FormLabel>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={entry.is_current}
                          onChange={(e) => updateWorkEntry(index, "is_current", e.target.checked)}
                          className="accent-accent"
                        />
                        Currently working here
                      </label>
                    </div>
                    <MonthYearPicker
                      value={entry.is_current ? "" : entry.end_date}
                      onChange={(v) => updateWorkEntry(index, "end_date", v)}
                      placeholder={entry.is_current ? "Present" : "Select date"}
                      disabled={entry.is_current}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <FormLabel>Key Responsibilities</FormLabel>
                  <BulletEditor
                    text={entry.responsibilities}
                    title={entry.title || "this role"}
                    company={entry.company || "this company"}
                    onChange={(bullets) => updateWorkBullets(index, bullets)}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addWorkEntry}
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Add role
            </button>
          </div>
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}

      {editingSection === "preferences" && (
        <SectionModal title="Edit Job Preferences" onClose={closeModal} onSave={handleSectionSave} saving={isPending}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormLabel>Job Titles Seeking</FormLabel>
              <TagInput
                tags={jobTitlesSeeking}
                onAdd={(tag) => setJobTitlesSeeking((prev) => [...prev, tag])}
                onRemove={(tag) => setJobTitlesSeeking((prev) => prev.filter((t) => t !== tag))}
                placeholder="Frontend Engineer, React Developer"
              />
            </div>
            <div>
              <FormLabel>Remote Preference</FormLabel>
              <FormSelect
                options={REMOTE_OPTIONS}
                value={remotePreference}
                onChange={setRemotePreference}
                placeholder="Select..."
              />
            </div>
            <div>
              <FormLabel>Salary Expectation (Optional)</FormLabel>
              <FormInput placeholder="e.g. $85k+" value={salaryExpectation} onChange={setSalaryExpectation} />
            </div>
            <div>
              <FormLabel>Cover Letter Tone</FormLabel>
              <FormSelect
                options={TONE_OPTIONS}
                value={coverLetterTone}
                onChange={setCoverLetterTone}
                placeholder="Select tone..."
              />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Preferred Locations (Optional)</FormLabel>
              <TagInput
                tags={preferredLocations}
                onAdd={(tag) => setPreferredLocations((prev) => [...prev, tag])}
                onRemove={(tag) => setPreferredLocations((prev) => prev.filter((l) => l !== tag))}
                placeholder="e.g. New York, London"
              />
            </div>
          </div>
          {saveError && <p className="mt-4 text-sm text-error">{saveError}</p>}
        </SectionModal>
      )}
    </>
  );
}

/* ------------------------------ bullet editor ----------------------------- */

type BulletEditorProps = {
  text: string;
  title: string;
  company: string;
  onChange: (bullets: string[]) => void;
};

/** Multi-line responsibilities text stored as newline-joined bullets. Each
 * row gets a real AI-rewrite action (rewriteBullet server action, teal —
 * never amber — per the app's AI-content color rule). "Generate from a
 * note" shows 3-4 candidate phrasings (generateBullets) rather than
 * auto-inserting one — the candidate picks which ones to add via the
 * leading + and can regenerate for a fresh batch. Both call the real
 * usage-capped Gemini actions in actions/profile.ts, not simulated text. */
// Grows to fit its full content instead of clipping/scrolling — a fixed
// single-line <input> was hiding real bullet text longer than one line
// (and rows=1 <textarea> without height sync showed a native scrollbar with
// up/down arrows once content overflowed, which read as a rendering bug).
function AutoGrowTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}

// LinkedIn-PDF/AI extraction often lands one long paragraph in a single
// responsibilities string (no literal newlines) — split it into individual
// sentence bullets so each one is separately visible/editable/rewritable,
// matching what's actually in the résumé instead of one dense blob. Once
// the user edits anything, onChange always rejoins with "\n" (see
// updateWorkBullets), so this heuristic only ever runs on the untouched
// original text.
function splitIntoBullets(text: string): string[] {
  if (text.includes("\n")) {
    return text.split("\n").map((b) => b.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function BulletEditor({ text, title, company, onChange }: BulletEditorProps) {
  const bullets = splitIntoBullets(text);
  const [note, setNote] = useState("");
  const [rewritingIndex, setRewritingIndex] = useState<number | null>(null);
  const [justRewrittenIndex, setJustRewrittenIndex] = useState<number | null>(null);
  const [splittingIndex, setSplittingIndex] = useState<number | null>(null);
  const [improvingAll, setImprovingAll] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function updateBullet(index: number, value: string) {
    onChange(bullets.map((b, i) => (i === index ? value : b)));
  }

  function removeBullet(index: number) {
    onChange(bullets.filter((_, i) => i !== index));
  }

  async function handleRewrite(index: number) {
    setAiError(null);
    setRewritingIndex(index);
    try {
      const result = await rewriteBullet(bullets[index], { title, company });
      if (result.success && result.text) {
        onChange(bullets.map((b, i) => (i === index ? result.text! : b)));
        setJustRewrittenIndex(index);
        window.setTimeout(() => setJustRewrittenIndex(null), 2200);
      } else {
        setAiError(result.error ?? "Failed to rewrite this bullet.");
      }
    } finally {
      setRewritingIndex(null);
    }
  }

  async function handleSplit(index: number) {
    setAiError(null);
    setSplittingIndex(index);
    try {
      const result = await splitBullet(bullets[index], { title, company });
      if (result.success && result.bullets) {
        onChange(bullets.flatMap((b, i) => (i === index ? result.bullets! : [b])));
      } else {
        setAiError(result.error ?? "Failed to split this bullet.");
      }
    } finally {
      setSplittingIndex(null);
    }
  }

  async function handleGenerate() {
    if (!note.trim()) return;
    setAiError(null);
    setGenerating(true);
    try {
      const result = await generateBullets(note, { title, company });
      if (result.success && result.bullets) {
        setSuggestions(result.bullets);
      } else {
        setAiError(result.error ?? "Failed to generate bullets.");
      }
    } finally {
      setGenerating(false);
    }
  }

  function addSuggestion(index: number) {
    const picked = suggestions?.[index];
    if (!picked) return;
    onChange([...bullets, picked]);
    setSuggestions((prev) => (prev ? prev.filter((_, i) => i !== index) : null));
  }

  // The per-bullet Split button (handleSplit) fixes one dense line at a
  // time — real fix, but N roles means N clicks. This does the same job
  // for the WHOLE list in one click: reuses splitBullet (no new backend
  // action needed) against everything currently in the box, replacing the
  // full list with whatever comes back. Same anti-fabrication rule, same
  // opt-in-only click — just scoped to the role instead of one line.
  async function handleImproveAll() {
    const combined = bullets.filter(Boolean).join(". ").trim();
    if (!combined) {
      setAiError("Add at least a rough note first, then improve with AI.");
      return;
    }
    setAiError(null);
    setImprovingAll(true);
    try {
      const result = await splitBullet(combined, { title, company });
      if (result.success && result.bullets) {
        onChange(result.bullets);
      } else {
        setAiError(result.error ?? "Failed to improve these bullets.");
      }
    } finally {
      setImprovingAll(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {bullets.filter(Boolean).length} bullet{bullets.filter(Boolean).length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={handleImproveAll}
          disabled={improvingAll || bullets.filter(Boolean).length === 0}
          title="Reorganize everything in this box into separate, distinct bullets"
          className="inline-flex items-center gap-1.5 rounded-lg bg-agent-muted px-2.5 py-1 text-[11px] font-medium text-agent-dark transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {improvingAll ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {improvingAll ? "Improving…" : "Improve all bullets with AI"}
        </button>
      </div>

      {bullets.map((b, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5 transition-all duration-300 ${
            justRewrittenIndex === i
              ? "border-agent bg-agent-light text-agent-dark"
              : "border-transparent bg-surface-secondary text-text-secondary"
          }`}
        >
          <span className="mt-0.5 shrink-0 text-accent">—</span>
          <AutoGrowTextarea
            value={b}
            onChange={(v) => updateBullet(i, v)}
            className="flex-1 bg-transparent leading-5 outline-none"
          />
          {justRewrittenIndex === i ? (
            <span className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-agent">
              <Check className="h-3 w-3" /> AI-rewritten
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSplit(i)}
                disabled={splittingIndex === i}
                aria-label="Split this bullet into separate points with AI"
                title="Split into separate bullets"
                className="mt-0.5 shrink-0 text-agent transition-transform hover:scale-110 disabled:opacity-60"
              >
                {splittingIndex === i ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Split className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRewrite(i)}
                disabled={rewritingIndex === i}
                aria-label="Rewrite this bullet with AI"
                title="Rewrite with AI"
                className="mt-0.5 shrink-0 text-agent transition-transform hover:scale-110 disabled:opacity-60"
              >
                {rewritingIndex === i ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
          <span aria-hidden="true" className="mt-0.5 h-4 w-px shrink-0 bg-border" />
          <button
            type="button"
            onClick={() => removeBullet(i)}
            aria-label="Remove bullet"
            className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-error"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...bullets, ""])}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-75"
      >
        <Plus className="h-3.5 w-3.5" />
        Add bullet point manually
      </button>

      <div className="rounded-lg border border-dashed border-agent/40 bg-agent-muted/40 p-3">
        <label className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-agent-dark">
          <Sparkles className="h-3 w-3" />
          Generate bullet options from a note
        </label>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I kept the app up 24/7 and trained two juniors"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-agent"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!note.trim() || generating}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-agent px-3 py-2 text-xs font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-agent/20 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-agent-dark">
                Pick the ones you like
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-agent-dark transition-opacity hover:opacity-75 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
                More options
              </button>
            </div>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="fade-in-up flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-xs leading-5 text-text-secondary ring-1 ring-agent/30"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <button
                  type="button"
                  onClick={() => addSuggestion(i)}
                  aria-label="Add this bullet"
                  title="Add this bullet"
                  className="mt-0.5 shrink-0 rounded-full bg-agent-muted p-0.5 text-agent transition-all duration-150 hover:scale-110 hover:bg-agent hover:text-agent-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="flex-1">{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {aiError && <p className="text-xs text-error">{aiError}</p>}
    </div>
  );
}
