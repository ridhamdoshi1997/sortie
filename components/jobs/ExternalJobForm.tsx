"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addExternalJob, fetchExternalJobText } from "@/actions/jobs";

export function ExternalJobForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  function handleFetch(): void {
    if (!url.trim()) return;
    setError(null);
    startFetch(async () => {
      const result = await fetchExternalJobText(url.trim());
      if (result.text) {
        setDescription(result.text);
      } else {
        setError("Couldn't fetch that page — paste the job description below instead.");
      }
    });
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!title.trim() || !company.trim() || !description.trim()) {
      setError("Title, company, and description are required.");
      return;
    }
    setError(null);
    startSubmit(async () => {
      const result = await addExternalJob({
        title: title.trim(),
        company: company.trim(),
        location: location.trim() || undefined,
        description: description.trim(),
        url: url.trim() || undefined,
      });
      if (result.success && result.jobId) {
        router.push(`/find-jobs/${result.jobId}`);
      } else {
        setError(result.error ?? "Failed to save job");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="job-url" className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Job URL (optional)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="job-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleFetch}
            disabled={!url.trim() || isFetching}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            {isFetching ? "Fetching..." : "Fetch from URL"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-title" className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            Title *
          </label>
          <input
            id="job-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-company" className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            Company *
          </label>
          <input
            id="job-company"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="job-location" className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Location
        </label>
        <input
          id="job-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="job-description" className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Job description *
        </label>
        <textarea
          id="job-description"
          required
          rows={10}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste the full job posting text here, or fetch it from the URL above."
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? "Evaluating..." : "Add & evaluate"}
      </button>
    </form>
  );
}
