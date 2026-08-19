import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublishedPageBySlug } from "@/lib/admin/content";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MarkdownContent } from "@/components/shared/MarkdownContent";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPageBySlug(slug);
  if (!page) return {};
  return {
    title: page.metaTitle || `${page.title} — Sortie`,
    description: page.metaDescription ?? undefined,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublishedPageBySlug(slug);

  if (!page) {
    notFound();
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-text-primary">{page.title}</h1>
        {page.publishedAt && <p className="mt-2 text-xs text-text-muted">{formatDate(page.publishedAt)}</p>}
        <div className="mt-8">
          <MarkdownContent markdown={page.bodyMarkdown} />
        </div>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
