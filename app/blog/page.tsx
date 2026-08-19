import Link from "next/link";
import type { Metadata } from "next";

import { listPublishedPages } from "@/lib/admin/content";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Blog — Sortie" };
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  const pages = await listPublishedPages();

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-text-primary">Blog</h1>
        {pages.length === 0 ? (
          <p className="mt-6 text-sm text-text-muted">Nothing published yet — check back soon.</p>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            {pages.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="border border-border bg-surface shadow-card rounded-2xl p-6 transition-colors hover:border-accent"
              >
                <h2 className="text-lg font-semibold text-text-primary">{p.title}</h2>
                <p className="mt-1 text-xs text-text-muted">{formatDate(p.publishedAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
