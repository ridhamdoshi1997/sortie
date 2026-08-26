"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  Briefcase,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Moon,
  Search,
  Settings,
  Sun,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";

import { quickSearchJobs, type QuickSearchJob } from "@/actions/jobs";
import { isPublicMarketingRoute } from "@/lib/publicRoutes";

type CommandItem = {
  id: string;
  label: string;
  group: "Navigate" | "Actions" | "Jobs";
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
};

// Global Cmd/Ctrl+K command palette — quick navigation + a couple of common
// actions, fully keyboard-driven (build-plan.md §H's "Command palette
// (Cmd+K)" and "Keyboard shortcuts" rows — shipped as one combined v1
// rather than two separate features, since a palette's core value already
// IS its keyboard interaction: arrow keys to move, Enter to run, Escape to
// close, Cmd/Ctrl+K to open from anywhere). Mounted once in app/layout.tsx
// via CommandPaletteLoader.tsx (ssr:false), same pattern as SettingsModal —
// listens globally, isn't tied to any one page. Also openable via a small
// trigger button in Navbar.tsx, which dispatches a "sortie:open-command-
// palette" window event rather than lifting state/context for one boolean —
// this component is the only listener, so a plain event is simpler than a
// new provider for a single global toggle.
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const [jobResults, setJobResults] = useState<QuickSearchJob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global search (build-plan.md §H) — debounced real-data search against
  // the user's own jobs, merged into the static command list below as a
  // "Jobs" group. 250ms debounce plus a stale-response guard (the closure's
  // own `query` at fire time, checked against the query at resolve time) so
  // a fast typist's earlier request can't overwrite a later one's results.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setJobResults([]);
      return;
    }
    const timer = setTimeout(() => {
      quickSearchJobs(trimmed).then((results) => {
        setJobResults((prev) => (query.trim() === trimmed ? results : prev));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Adjust state during render (React-sanctioned pattern, same idiom
  // Navbar.tsx already uses for its own pathname-change reset) rather than
  // a setState-in-effect — the highlighted row must never be stale/
  // out-of-range after a keystroke changes which commands are filtered in.
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  function openSettingsModal() {
    const params = new URLSearchParams(window.location.search);
    params.set("settings", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const commands: CommandItem[] = [
    { id: "dashboard", label: "Dashboard", group: "Navigate", icon: LayoutDashboard, run: () => router.push("/dashboard") },
    {
      id: "find-jobs",
      label: "Find & Evaluate",
      group: "Navigate",
      icon: Search,
      keywords: "search jobs sortie",
      run: () => router.push("/find-jobs"),
    },
    {
      id: "missions",
      label: "Missions",
      group: "Navigate",
      icon: Briefcase,
      keywords: "tracker pipeline applications kanban",
      run: () => router.push("/missions"),
    },
    {
      id: "career",
      label: "Career",
      group: "Navigate",
      icon: Trophy,
      keywords: "timeline accomplishments star vault",
      run: () => router.push("/career"),
    },
    { id: "resume", label: "Resume", group: "Navigate", icon: FileText, run: () => router.push("/resume") },
    {
      id: "interview",
      label: "Interview",
      group: "Navigate",
      icon: MessageSquareText,
      keywords: "question bank prep",
      run: () => router.push("/interview"),
    },
    { id: "profile", label: "Profile", group: "Navigate", icon: User, run: () => router.push("/profile") },
    { id: "notifications", label: "Notifications", group: "Navigate", icon: Bell, run: () => router.push("/notifications") },
    { id: "settings", label: "Settings", group: "Actions", icon: Settings, run: openSettingsModal },
    {
      id: "theme",
      label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      group: "Actions",
      icon: resolvedTheme === "dark" ? Sun : Moon,
      keywords: "dark mode light mode appearance",
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ];

  const jobCommands: CommandItem[] = jobResults.map((job) => ({
    id: `job-${job.id}`,
    label: job.company ? `${job.title} · ${job.company}` : job.title,
    group: "Jobs",
    icon: Briefcase,
    run: () => router.push(`/find-jobs/${job.id}`),
  }));

  const filtered = [
    ...commands.filter((c) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q);
    }),
    ...jobCommands,
  ];

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setJobResults([]);
  }

  function runActive() {
    const item = filtered[activeIndex];
    if (!item) return;
    close();
    item.run();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        // Real bug caught live: an earlier version toggled `open` directly
        // here (and Escape below did the same), bypassing close()'s query/
        // activeIndex reset — a query typed before closing was still there
        // the next time the palette opened, silently prepending onto
        // whatever got typed next. Both branches now always reset all three
        // fields, whether this keypress is opening or closing.
        setOpen((wasOpen) => {
          if (wasOpen) {
            setQuery("");
            setActiveIndex(0);
            setJobResults([]);
          }
          return !wasOpen;
        });
        return;
      }
      if (event.key === "Escape") {
        setOpen((wasOpen) => {
          if (wasOpen) {
            event.preventDefault();
            setQuery("");
            setActiveIndex(0);
            setJobResults([]);
          }
          return false;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener("sortie:open-command-palette", onExternalOpen);
    return () => window.removeEventListener("sortie:open-command-palette", onExternalOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus after the entrance animation's first paint, not synchronously —
    // the input isn't in the DOM yet on the same tick `open` flips true.
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Every static command here points to an authenticated-only page, and
  // quickSearchJobs() requires a logged-in user — same reasoning as
  // NavigatorLauncher.tsx's public-route gate, previously missing here
  // entirely (found during the homepage performance pass, 2026-08-20).
  if (!open || isPublicMarketingRoute(pathname)) return null;

  const groups = Array.from(new Set(filtered.map((c) => c.group)));
  let runningIndex = -1;

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm duration-150"
      onClick={close}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 glass-panel-strong w-full max-w-lg overflow-hidden rounded-2xl duration-150 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runActive();
              }
            }}
            placeholder="Jump to a page or run a command…"
            className="h-6 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-text-muted">No matches.</p>}
          {groups.map((group) => (
            <div key={group}>
              <p className="px-3 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {group}
              </p>
              {filtered
                .filter((c) => c.group === group)
                .map((item) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => {
                        close();
                        item.run();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                        isActive ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-surface-secondary"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2 font-mono text-[10px] text-text-muted">
          <span>&#8593;&#8595; navigate</span>
          <span>&#8629; select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
