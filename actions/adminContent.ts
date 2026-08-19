"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import {
  listPages,
  getPageById,
  getPageBySlug,
  generatePageDraft,
  type PageListRow,
  type PageRow,
} from "@/lib/admin/content";
import { toUserMessage } from "@/lib/errors";

// Content/CMS (admin console expansion item 2, context/RESUME.md). Same
// requireAdmin()-inside-every-action pattern as actions/admin.ts — a
// layout only blocks the UI, it never stops a Server Action from being
// invoked directly. Split into its own file (actions/admin.ts was already
// 476 lines before this) rather than growing one file further; every
// action here follows the exact same auth/gating/audit shape.
type ActionResult = { success: true } | { success: false; error: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PagesListResult = { success: true; pages: PageListRow[] } | { success: false; error: string };

export async function getPagesList(): Promise<PagesListResult> {
  try {
    await requireAdmin();
    const pages = await listPages();
    return { success: true, pages };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type PageDetailResult = { success: true; page: PageRow | null } | { success: false; error: string };

export async function getPageDetail(id: string): Promise<PageDetailResult> {
  try {
    await requireAdmin();
    const page = await getPageById(id);
    return { success: true, page };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type SavePageInput = {
  id: string | null;
  slug: string;
  title: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
};

type SavePageResult = { success: true; id: string } | { success: false; error: string };

export async function savePage(input: SavePageInput): Promise<SavePageResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const slug = input.slug.trim().toLowerCase();
    const title = input.title.trim();

    if (!title) return { success: false, error: "Enter a title." };
    if (!SLUG_PATTERN.test(slug)) {
      return { success: false, error: "Slug must be lowercase letters, numbers, and hyphens only (e.g. about-us)." };
    }

    const existingWithSlug = await getPageBySlug(slug);
    if (existingWithSlug && existingWithSlug.id !== input.id) {
      return { success: false, error: "Another page already uses this slug." };
    }

    const row = {
      slug,
      title,
      body_markdown: input.bodyMarkdown,
      meta_title: input.metaTitle.trim() || null,
      meta_description: input.metaDescription.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await client.database.from("pages").update(row).eq("id", input.id);
      if (error) return { success: false, error: toUserMessage(error, "Failed to save this page.") };

      await logAdminAction(admin, { action: "update_page", targetTable: "pages", targetId: input.id, after: { slug, title } });
      revalidatePath("/admin/content");
      revalidatePath(`/blog/${slug}`);
      return { success: true, id: input.id };
    }

    const { data, error } = await client.database
      .from("pages")
      .insert([{ ...row, status: "draft", created_by: admin.id }])
      .select("id")
      .single<{ id: string }>();

    if (error || !data) return { success: false, error: toUserMessage(error, "Failed to create this page.") };

    await logAdminAction(admin, { action: "create_page", targetTable: "pages", targetId: data.id, after: { slug, title } });
    revalidatePath("/admin/content");
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function setPageStatus(id: string, status: "draft" | "published"): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const page = await getPageById(id);
    if (!page) return { success: false, error: "Page not found." };

    // Only stamp published_at on a genuine draft -> published transition —
    // re-saving edits while already published, or unpublishing, must never
    // reset the original publish date.
    const publishedAt = status === "published" && page.status !== "published" ? new Date().toISOString() : undefined;

    const { error } = await client.database
      .from("pages")
      .update({ status, updated_at: new Date().toISOString(), ...(publishedAt ? { published_at: publishedAt } : {}) })
      .eq("id", id);

    if (error) return { success: false, error: toUserMessage(error, "Failed to update this page's status.") };

    await logAdminAction(admin, {
      action: status === "published" ? "publish_page" : "unpublish_page",
      targetTable: "pages",
      targetId: id,
      before: { status: page.status },
      after: { status },
    });

    revalidatePath("/admin/content");
    revalidatePath(`/blog/${page.slug}`);
    revalidatePath("/blog");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function deletePage(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const page = await getPageById(id);
    if (!page) return { success: false, error: "Page not found." };

    const { error } = await client.database.from("pages").delete().eq("id", id);
    if (error) return { success: false, error: toUserMessage(error, "Failed to delete this page.") };

    await logAdminAction(admin, { action: "delete_page", targetTable: "pages", targetId: id, before: { slug: page.slug, title: page.title } });

    revalidatePath("/admin/content");
    revalidatePath("/blog");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type DraftResult = { success: true; bodyMarkdown: string } | { success: false; error: string };

export async function generateDraft(title: string, brief: string): Promise<DraftResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    if (!title.trim()) return { success: false, error: "Enter a title first." };

    const bodyMarkdown = await generatePageDraft(title, brief);
    return { success: true, bodyMarkdown };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to generate a draft.") };
  }
}
