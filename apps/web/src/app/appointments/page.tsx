"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { api, type Appointment } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

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
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Appointments"
        subtitle="Booked by your AI (and your team). Reminders go out automatically the day before."
      />
      {upcoming.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Nothing booked yet"
            description="Enable booking in Settings, and the AI starts offering real slots in chat."
          />
        </Card>
      ) : (
        [...byDay.entries()].map(([day, appts]) => (
          <section key={day} className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {new Date(day).toLocaleDateString("en-KE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <ul className="space-y-2">
              {appts.map((a) => (
                <Card key={a.id} className="flex items-center gap-3 p-3">
                  <div className="tnum grid w-16 shrink-0 place-items-center rounded-card bg-primary-soft py-1.5 text-sm font-semibold text-primary-700">
                    {new Date(a.startsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                  <Avatar name={a.contact.name} phone={a.contact.phone} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.contact.name ?? a.contact.phone}
                    </div>
                    {a.note && <div className="truncate text-xs text-muted">{a.note}</div>}
                  </div>
                  <button
                    onClick={() => void api.cancelAppointment(a.id).then(refresh)}
                    className="shrink-0 rounded-card px-2 py-1 text-xs font-medium text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    Cancel
                  </button>
                </Card>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
