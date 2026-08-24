"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Theme is only known client-side (next-themes reads localStorage/system
  // preference after mount) — render a neutral placeholder until then so
  // server and first-client render match and nothing flashes the wrong icon.
  // useSyncExternalStore's getServerSnapshot/getSnapshot split gives us that
  // without a setState-in-effect (React always re-renders once the client
  // snapshot differs from the server one).
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <span className="inline-block h-5 w-5" aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-5 w-5 items-center justify-center text-overlay-foreground/60 transition-colors hover:text-overlay-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
