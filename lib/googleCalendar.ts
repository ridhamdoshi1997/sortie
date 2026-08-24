// Read-only OAuth into a user's own Google Calendar (build-plan.md §G —
// interview detection). Dependency-free REST wrapper, same shape as
// lib/notion.ts — no googleapis SDK needed for a handful of calls.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export function buildGoogleCalendarAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string, redirectUri: string): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const body = (await response.json().catch(() => null)) as { refresh_token?: string } | null;
  return response.ok ? (body?.refresh_token ?? null) : null;
}

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  return response.ok ? (body?.access_token ?? null) : null;
}

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string | null;
};

// Next 14 days only — this is a lightweight "did an interview land on my
// calendar" check, not a general calendar sync.
export async function listUpcomingEvents(refreshToken: string): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const response = await fetch(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => null)) as {
    items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }>;
  } | null;
  if (!response.ok || !body?.items) return [];

  return body.items.map((event) => ({
    id: event.id,
    summary: event.summary || "Untitled event",
    start: event.start?.dateTime ?? event.start?.date ?? null,
  }));
}
