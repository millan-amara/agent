"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Appointment } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const refresh = useCallback(() => {
    api.appointments().then(setAppointments).catch(() => {});
  }, []);
  useEffect(() => refresh(), [refresh]);
  useLive(useCallback(() => refresh(), [refresh]));

  const upcoming = appointments.filter((a) => a.status === "booked");

  const byDay = new Map<string, Appointment[]>();
  for (const a of upcoming) {
    const key = new Date(a.startsAt).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  return (
    <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-1 font-semibold">Appointments</h1>
      <p className="mb-4 text-sm text-muted">
        Booked by your AI (and your team). Reminders go out automatically the day before.
      </p>
      {upcoming.length === 0 ? (
        <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
          Nothing booked yet. Enable booking in Settings, and the AI starts offering slots in chat.
        </p>
      ) : (
        [...byDay.entries()].map(([day, appts]) => (
          <section key={day} className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {new Date(day).toLocaleDateString("en-KE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <ul className="space-y-2">
              {appts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-white p-3"
                >
                  <div className="tnum w-16 shrink-0 text-sm font-semibold">
                    {new Date(a.startsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.contact.name ?? a.contact.phone}
                    </div>
                    {a.note && <div className="truncate text-xs text-muted">{a.note}</div>}
                  </div>
                  <button
                    onClick={() => void api.cancelAppointment(a.id).then(refresh)}
                    className="shrink-0 text-xs font-medium text-muted hover:text-danger"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
