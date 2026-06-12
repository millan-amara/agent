"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type DashboardData } from "@/lib/api";
import { useLive } from "@/lib/useLive";

/** The owner's home screen: what did Azayon make me this month? */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  const refresh = useCallback(() => {
    api.dashboard().then(setData).catch(() => {});
  }, []);
  useEffect(() => refresh(), [refresh]);
  useLive(useCallback(() => refresh(), [refresh]));

  if (!data) return <p className="p-6 text-sm text-muted">Loading…</p>;

  const trialDaysLeft = data.billing.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.billing.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4">
      <h1 className="mb-1 font-semibold">Last 30 days</h1>
      <p className="mb-4 text-sm text-muted">What Azayon has been doing for your business.</p>

      {data.needsHuman > 0 && (
        <Link
          href="/inbox"
          className="mb-4 block rounded-card bg-attentionSoft px-4 py-3 text-sm font-medium text-attention"
        >
          🔥 {data.needsHuman} conversation{data.needsHuman > 1 ? "s" : ""} waiting for you — open
          the inbox
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="New leads" value={data.newLeads} />
        <Stat label="Qualified" value={data.qualified} />
        <Stat label="Appointments booked" value={data.booked} />
        <Stat label="Follow-ups sent" value={data.followUpsSent} />
        <Stat
          label="Leads recovered"
          value={data.recovered}
          hint="replied after a follow-up nudge"
        />
        <Stat
          label="Payments collected"
          value={`KES ${data.paidKes.toLocaleString()}`}
          strong
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Right now
          </h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Conversations active (24h)" value={String(data.activeConversations)} />
            <Row label="Waiting for a human" value={String(data.needsHuman)} />
            <Row
              label="WhatsApp"
              value={data.health.waConnected ? "Connected" : "Not connected"}
            />
            <Row label="AI" value={data.health.aiEnabled ? "On" : "Off"} />
          </dl>
        </section>

        <section className="rounded-card border border-line bg-white p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Your plan
          </h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Plan" value={data.billing.plan === "trial" ? "Free trial" : data.billing.plan} />
            {trialDaysLeft !== null && (
              <Row label="Trial remaining" value={`${trialDaysLeft} days`} />
            )}
            <Row
              label="AI replies this month"
              value={data.billing.usageThisMonth.llmCalls.toLocaleString()}
            />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: number | string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <div className={`tnum text-2xl font-semibold ${strong ? "text-primary-dark" : ""}`}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  );
}
