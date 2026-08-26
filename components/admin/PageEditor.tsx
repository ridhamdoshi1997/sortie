"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { savePage, setPageStatus, deletePage, generateDraft } from "@/actions/adminContent";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import type { AdminRole } from "@/lib/admin/auth";
import type { PageRow, PageStatus } from "@/lib/admin/content";

// New-page mode passes initialPage: null. Existing-page mode hydrates from
// the real row. Same single-component shape either way — the only branch
// is whether Publish/Unpublish/Delete render (need a real id first).
export function PageEditor({ initialPage, viewerRole }: { initialPage: PageRow | null; viewerRole: AdminRole }) {
  const router = useRouter();
  const [id, setId] = useState(initialPage?.id ?? null);
  const [slug, setSlug] = useState(initialPage?.slug ?? "");
  const [title, setTitle] = useState(initialPage?.title ?? "");
  const [bodyMarkdown, setBodyMarkdown] = useState(initialPage?.bodyMarkdown ?? "");
  const [metaTitle, setMetaTitle] = useState(initialPage?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(initialPage?.metaDescription ?? "");
  const [status, setStatus] = useState<PageStatus>(initialPage?.status ?? "draft");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  function handleSave(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await savePage({ id, slug, title, bodyMarkdown, metaTitle, metaDescription });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice("Saved.");
      if (!id) {
        setId(result.id);
        router.replace(`/admin/content/${result.id}`);
      }
    });
  }

  function handlePublishToggle(): void {
    if (!id) return;
    setError(null);
    setNotice(null);
    const next: PageStatus = status === "published" ? "draft" : "published";
    startTransition(async () => {
      const result = await setPageStatus(id, next);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStatus(next);
      setNotice(next === "published" ? "Published." : "Unpublished.");
    });
  }

  function handleDelete(): void {
    if (!id) return;
    startTransition(async () => {
      const result = await deletePage(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/content");
    });
  }

  function handleGenerateDraft(): void {
    if (!title.trim()) {
      setError("Enter a title first.");
      return;
    }
    setError(null);
    startGenerating(async () => {
      const result = await generateDraft(title, brief);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBodyMarkdown(result.bodyMarkdown);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canWrite}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            />
          </Field>
          <Field label="Slug">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="about-us"
              disabled={!canWrite}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            />
          </Field>
          <Field label="Meta title (SEO)">
            <input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              disabled={!canWrite}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            />
          </Field>
          <Field label="Meta description (SEO)">
            <input
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              disabled={!canWrite}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            />
          </Field>
        </div>

        {canWrite && (
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-[11px] font-medium text-text-muted">AI first-draft brief (optional)</label>
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What should this page cover?"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={isGenerating}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Generating..." : "AI first draft"}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Markdown</h2>
          <textarea
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            rows={20}
            disabled={!canWrite}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 font-mono text-xs text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
          />
        </div>
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Preview</h2>
          <MarkdownContent markdown={bodyMarkdown} />
        </div>
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="btn-signal h-9 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Save
          </button>
          {id && (
            <button
              type="button"
              onClick={handlePublishToggle}
              disabled={isPending}
              className={`h-9 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
                status === "published"
                  ? "border-border text-text-secondary hover:bg-surface-secondary"
                  : "border-accent text-accent hover:bg-accent-light"
              }`}
            >
              {status === "published" ? "Unpublish" : "Publish"}
            </button>
          )}
          {id && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="h-9 rounded-md border border-error/30 px-4 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this page?"
        description={`"${title || "This page"}" will be permanently deleted${status === "published" ? " and immediately unpublished" : ""}.`}
        confirmLabel="Delete"
        pending={isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
