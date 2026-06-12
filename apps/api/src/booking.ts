import type { Tenant } from "@prisma/client";
import { db } from "./db.js";

/**
 * Internal booking calendar: weekly opening hours → bookable slots, minus
 * existing appointments. Times are server-local (deployment region = tenant
 * region for now; per-tenant timezones come with Google Calendar sync).
 */

export interface DayHours {
  start: string; // "08:00"
  end: string; // "17:00"
}

export interface BookingConfig {
  enabled: boolean;
  slotMinutes: number;
  daysAhead: number;
  hours: Record<string, DayHours | null>; // keys "0" (Sun) .. "6" (Sat)
}

const DEFAULT_HOURS: Record<string, DayHours | null> = {
  "0": null,
  "1": { start: "09:00", end: "17:00" },
  "2": { start: "09:00", end: "17:00" },
  "3": { start: "09:00", end: "17:00" },
  "4": { start: "09:00", end: "17:00" },
  "5": { start: "09:00", end: "17:00" },
  "6": null,
};

export function parseBookingConfig(tenant: Tenant): BookingConfig {
  const raw = JSON.parse(tenant.bookingConfig || "{}") as Partial<BookingConfig>;
  return {
    enabled: raw.enabled ?? false,
    slotMinutes: raw.slotMinutes && raw.slotMinutes >= 10 ? raw.slotMinutes : 60,
    daysAhead: raw.daysAhead && raw.daysAhead >= 1 ? Math.min(raw.daysAhead, 60) : 14,
    hours: raw.hours ?? DEFAULT_HOURS,
  };
}

function parseTime(day: Date, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const d = new Date(day);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/** Next available slots: within opening hours, in the future, no conflicts. */
export async function computeAvailableSlots(
  tenant: Tenant,
  limit = 24,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
  const cfg = parseBookingConfig(tenant);
  if (!cfg.enabled) return [];

  const horizon = new Date(Date.now() + cfg.daysAhead * 86_400_000);
  const booked = await db.appointment.findMany({
    where: { tenantId: tenant.id, status: "booked", startsAt: { gte: new Date(), lte: horizon } },
    select: { startsAt: true, endsAt: true },
  });

  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
  const now = Date.now();
  for (let d = 0; d <= cfg.daysAhead && slots.length < limit; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const hours = cfg.hours[String(day.getDay())];
    if (!hours) continue;
    const open = parseTime(day, hours.start);
    const close = parseTime(day, hours.end);
    if (!open || !close) continue;

    for (
      let t = open.getTime();
      t + cfg.slotMinutes * 60_000 <= close.getTime() && slots.length < limit;
      t += cfg.slotMinutes * 60_000
    ) {
      if (t <= now) continue;
      const end = t + cfg.slotMinutes * 60_000;
      const conflict = booked.some(
        (b) => t < b.endsAt.getTime() && end > b.startsAt.getTime(),
      );
      if (!conflict) slots.push({ startsAt: new Date(t), endsAt: new Date(end) });
    }
  }
  return slots;
}

export function formatSlot(d: Date): string {
  return d.toLocaleString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
