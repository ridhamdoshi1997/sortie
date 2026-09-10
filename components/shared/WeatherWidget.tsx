import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Zap,
} from "lucide-react";

import { getWeatherForLocation } from "@/lib/weather";

// Google News puts a small weather card beside the briefing; this is the same
// idea in this app's own chrome (2026-09-10, direct user request — News page
// and dashboard). Renders NOTHING when the profile has no location or the
// lookup fails: an empty slot is honest, a guessed city is not.
//
// A Server Component on purpose. The fetch is cached upstream
// (lib/weather.ts), so this costs nothing per render on the client and ships
// no JS for it.

function renderIcon(code: number, isDay: boolean) {
  const cls = "h-8 w-8 shrink-0 text-accent";
  if (code === 0) return isDay ? <Sun className={cls} aria-hidden="true" /> : <Moon className={cls} aria-hidden="true" />;
  if (code === 1 || code === 2) return <CloudSun className={cls} aria-hidden="true" />;
  if (code === 45 || code === 48) return <CloudFog className={cls} aria-hidden="true" />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={cls} aria-hidden="true" />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className={cls} aria-hidden="true" />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={cls} aria-hidden="true" />;
  if (code >= 95) return <Zap className={cls} aria-hidden="true" />;
  return <Cloud className={cls} aria-hidden="true" />;
}


export async function WeatherWidget({
  location,
  className = "",
}: {
  location: string | null | undefined;
  className?: string;
}) {
  const weather = await getWeatherForLocation(location);
  if (!weather) return null;

  // Rendered through a helper rather than bound to a capitalised local, which
  // react-hooks/static-components reads as creating a component during render.
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 ${className}`}>
      {renderIcon(weather.code, weather.isDay)}
      <div className="min-w-0">
        <p className="truncate text-xs text-text-secondary">{weather.place}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold tabular-nums leading-none text-text-primary">
            {weather.temperatureC}°
          </span>
          <span className="truncate text-xs text-text-muted">{weather.label}</span>
        </p>
        {weather.highC !== null && weather.lowC !== null && (
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
            H {weather.highC}° · L {weather.lowC}°
          </p>
        )}
      </div>
    </div>
  );
}
