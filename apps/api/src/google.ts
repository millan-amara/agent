import type { Tenant } from "@prisma/client";
import { config } from "./config.js";
import { db } from "./db.js";
import { fetchWithTimeout } from "./http.js";

/**
 * Google Calendar sync (per-tenant OAuth). Pushes internal appointments to the
 * tenant's calendar and pulls busy times so externally-booked slots stop
 * showing as available — effectively two-way for scheduling. REST via fetch
 * (no googleapis SDK), gated on GOOGLE_CLIENT_ID/SECRET.
 */
const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

export const googleConfigured = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

/** Consent URL; `state` carries the tenant id through the redirect. */
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: config.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // force a refresh token
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

/** Exchanges an auth code for tokens; returns the refresh token to persist. */
export async function exchangeCode(code: string): Promise<string | null> {
  const res = await fetchWithTimeout(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID ?? "",
      client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: config.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string };
  return data.refresh_token ?? null;
}

async function accessToken(tenant: Tenant): Promise<string | null> {
  if (!tenant.googleRefreshToken || !googleConfigured) return null;
  const res = await fetchWithTimeout(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tenant.googleRefreshToken,
      client_id: config.GOOGLE_CLIENT_ID ?? "",
      client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[google] token refresh failed:", await res.text());
    return null;
  }
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export const calendarConnected = (tenant: Tenant): boolean => Boolean(tenant.googleRefreshToken);

/** Pushes an appointment to Google Calendar; returns the event id (or null). */
export async function pushEvent(
  tenant: Tenant,
  appt: { startsAt: Date; endsAt: Date; note: string },
  attendeeName: string,
): Promise<string | null> {
  const token = await accessToken(tenant);
  if (!token) return null;
  const res = await fetchWithTimeout(
    `${CAL}/calendars/${encodeURIComponent(tenant.googleCalendarId ?? "primary")}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `${attendeeName} — ${tenant.name}`,
        description: appt.note,
        start: { dateTime: appt.startsAt.toISOString() },
        end: { dateTime: appt.endsAt.toISOString() },
      }),
    },
  );
  if (!res.ok) {
    console.error("[google] event insert failed:", await res.text());
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

export async function deleteEvent(tenant: Tenant, eventId: string): Promise<void> {
  const token = await accessToken(tenant);
  if (!token) return;
  await fetchWithTimeout(
    `${CAL}/calendars/${encodeURIComponent(tenant.googleCalendarId ?? "primary")}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  ).catch((err) => console.error("[google] event delete failed:", err));
}

/** Busy intervals from the tenant's calendar between two times. */
export async function busyTimes(
  tenant: Tenant,
  timeMin: Date,
  timeMax: Date,
): Promise<Array<{ start: Date; end: Date }>> {
  const token = await accessToken(tenant);
  if (!token) return [];
  const res = await fetchWithTimeout(`${CAL}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: tenant.googleCalendarId ?? "primary" }],
    }),
  });
  if (!res.ok) {
    console.error("[google] freebusy failed:", await res.text());
    return [];
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const cal = Object.values(data.calendars ?? {})[0];
  return (cal?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

/** Disconnects the tenant from Google Calendar. */
export async function disconnectGoogle(tenantId: string): Promise<void> {
  await db.tenant.update({ where: { id: tenantId }, data: { googleRefreshToken: null } });
}
