import { Navbar } from "@/components/layout/Navbar";

export default function FindJobsLoading() {
    return (
        <>
            <Navbar isAuthenticated />
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8">
                <div className="flex flex-col gap-2">
                    <div className="h-9 w-64 animate-pulse rounded-md bg-surface-secondary" />
                    <div className="h-5 w-96 animate-pulse rounded-md bg-surface-secondary" />
                </div>

                {/* Mission console skeleton — matches FindJobsForm's dark hero shell */}
                <div className="animate-pulse rounded-2xl border border-overlay bg-overlay p-8 shadow-card md:p-12">
                    <div className="mb-8 h-9 w-80 rounded-md bg-overlay-foreground/10" />
                    <div className="h-14 w-full rounded-xl bg-overlay-foreground/5" />
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
