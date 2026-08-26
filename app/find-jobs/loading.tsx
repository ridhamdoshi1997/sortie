import { Navbar } from "@/components/layout/Navbar";

export default function FindJobsLoading() {
    return (
        <>
            <Navbar isAuthenticated />
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-8">
                <div className="mx-auto w-full max-w-6xl">
                    <div className="h-3 w-40 animate-pulse rounded-full bg-surface-secondary" />
                </div>

                {/* Mission console skeleton — matches FindJobsForm's real
                    surface-card shell (2026-08-25: that card was compacted
                    and decoupled from the fixed-dark `overlay` tokens, this
                    skeleton was still shaped like the old one). */}
                <div className="mx-auto w-full max-w-6xl animate-pulse rounded-2xl border border-border bg-surface p-5 shadow-card md:p-6">
                    <div className="mb-4 h-6 w-48 rounded-md bg-surface-secondary" />
                    <div className="h-12 w-full rounded-xl bg-surface-secondary" />
                </div>

                {/* Job card skeletons */}
                <div className="flex flex-col gap-4 border-t border-border pt-6">
                    <div className="h-3 w-40 animate-pulse rounded-full bg-surface-secondary" />
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="grid animate-pulse grid-cols-[1fr_auto] items-start gap-4 rounded-2xl border border-border bg-surface p-5"
                        >
                            <div className="flex flex-col gap-2">
                                <div className="h-4 w-56 rounded-md bg-surface-secondary" />
                                <div className="h-3 w-40 rounded-md bg-surface-secondary" />
                            </div>
                            <div className="h-7 w-10 rounded-md bg-surface-secondary" />
                        </div>
                    ))}
                </div>
            </main>
        </>
    );
}
