// Weather for the News page and the dashboard (2026-09-10, direct user
// request).
//
// Open-Meteo, deliberately: it is genuinely free, needs NO API key, and
// imposes no attribution requirement — verified live before this file was
// written (geocoding + forecast both returned real data for Toronto with a
// plain unauthenticated GET). Every paid weather provider considered would
// have put a per-call cost on a widget that renders on two of this app's
// most-visited pages, which is exactly the kind of passive per-view spend
// this codebase avoids elsewhere (see lib/jobRecommendations' successor in
// app/jobs/recommended for the same reasoning applied to job data).
//
// Nothing here is ever fabricated: an unresolvable location returns null and
// the widget renders nothing rather than guessing at a city or a temperature.

export type WeatherNow = {
  place: string;
  temperatureC: number;
  feelsLikeC: number | null;
  highC: number | null;
  lowC: number | null;
  code: number;
  label: string;
  isDay: boolean;
};

// WMO weather interpretation codes — the documented code table Open-Meteo
// returns in `weather_code`. Grouped to the granularity a one-line widget can
// actually show; an unknown code falls back to a neutral label rather than a
// wrong one.
const WMO_LABELS: [number[], string][] = [
  [[0], "Clear"],
  [[1, 2], "Partly cloudy"],
  [[3], "Overcast"],
  [[45, 48], "Fog"],
  [[51, 53, 55, 56, 57], "Drizzle"],
  [[61, 63, 65, 66, 67], "Rain"],
  [[71, 73, 75, 77], "Snow"],
  [[80, 81, 82], "Showers"],
  [[85, 86], "Snow showers"],
  [[95, 96, 99], "Thunderstorm"],
];

export function weatherLabel(code: number): string {
  for (const [codes, label] of WMO_LABELS) {
    if (codes.includes(code)) return label;
  }
  return "Current conditions";
}

type GeocodeResult = { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string };

async function geocode(location: string): Promise<GeocodeResult | null> {
  // Open-Meteo's geocoder matches on a plain city name, so "Toronto, ON,
  // Canada" has to be reduced to its first segment — passing the whole
  // string returns nothing at all (the same first-segment reduction
  // lib/proactiveAtsCrawl.ts's expandCityToMetro already does for its own
  // city lookups).
  const city = location.split(",")[0]?.trim();
  if (!city) return null;

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      // A city's coordinates do not move. Cached for a day so a page render
      // never pays for this twice.
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: GeocodeResult[] };
    return json.results?.[0] ?? null;
  } catch (error) {
    console.error("[weather] geocode failed", location, error);
    return null;
  }
}

export async function getWeatherForLocation(location: string | null | undefined): Promise<WeatherNow | null> {
  if (!location?.trim()) return null;

  const place = await geocode(location);
  if (!place) return null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,apparent_temperature,weather_code,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
      // Half an hour: fresh enough that the number is honest, long enough
      // that a burst of page views costs one upstream call.
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number; is_day?: number };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
    };

    const current = json.current;
    if (typeof current?.temperature_2m !== "number" || typeof current.weather_code !== "number") return null;

    return {
      place: place.admin1 ? `${place.name}, ${place.admin1}` : place.name,
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: typeof current.apparent_temperature === "number" ? Math.round(current.apparent_temperature) : null,
      highC: typeof json.daily?.temperature_2m_max?.[0] === "number" ? Math.round(json.daily.temperature_2m_max[0]) : null,
      lowC: typeof json.daily?.temperature_2m_min?.[0] === "number" ? Math.round(json.daily.temperature_2m_min[0]) : null,
      code: current.weather_code,
      label: weatherLabel(current.weather_code),
      isDay: current.is_day !== 0,
    };
  } catch (error) {
    console.error("[weather] forecast failed", location, error);
    return null;
  }
}
