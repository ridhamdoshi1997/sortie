// Read-only OAuth into a user's own Outlook/Microsoft 365 calendar
// (build-plan.md §G — interview detection). Same shape as
// lib/googleCalendar.ts, dependency-free REST, no Microsoft Graph SDK.
// "common" tenant so both work and personal Microsoft accounts can sign in.

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const CALENDAR_VIEW_URL = "https://graph.microsoft.com/v1.0/me/calendarview";
const SCOPE = "offline_access Calendars.Read";

export function buildOutlookAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    response_mode: "query",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string, redirectUri: string): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: SCOPE,
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
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPE,
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

// Next 14 days only, same lightweight scope as the Google Calendar version.
export async function listUpcomingEvents(refreshToken: string): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken) return [];

  const startDateTime = new Date().toISOString();
  const endDateTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $orderby: "start/dateTime",
    $top: "50",
  });

  const response = await fetch(`${CALENDAR_VIEW_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  const body = (await response.json().catch(() => null)) as {
    value?: Array<{ id: string; subject?: string; start?: { dateTime?: string } }>;
  } | null;
  if (!response.ok || !body?.value) return [];

  return body.value.map((event) => ({
    id: event.id,
    summary: event.subject || "Untitled event",
    start: event.start?.dateTime ? `${event.start.dateTime}Z` : null,
  }));
}
