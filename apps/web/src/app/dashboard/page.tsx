"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Flame,
  UserPlus,
  BadgeCheck,
  CalendarCheck,
  Send,
  Undo2,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { api, type DashboardData, type AttributionSource } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { useT } from "@/lib/i18n";
import { Card, CardLabel } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** The owner's home screen: what did Azayon make me this month? */
export default function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sources, setSources] = useState<AttributionSource[]>([]);

  const refresh = useCallback(() => {
    api.dashboard().then(setData).catch(() => {});
    api.attribution().then((r) => setSources(r.sources)).catch(() => {});
  }, []);
  useEffect(() => refresh(), [refresh]);
  useLive(useCallback(() => refresh(), [refresh]));

  if (!data) return <DashboardSkeleton />;

  const trialDaysLeft = data.billing.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.billing.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto p-4 md:p-8">
      <PageHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />

      {data.needsHuman > 0 && (
        <Link
          href="/inbox"
          className="mb-6 flex items-center gap-3 rounded-card border border-attention/20 bg-attentionSoft px-4 py-3 text-sm font-medium text-attention transition-colors hover:bg-attentionSoft/70"
        >
          <Flame className="size-5 shrink-0" strokeWidth={2.25} />
          <span className="flex-1">
            {data.needsHuman} conversation{data.needsHuman > 1 ? "s" : ""} waiting for you
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold">
            Open inbox <ArrowRight className="size-4" />
          </span>
        </Link>
      )}

      {/* Hero: the money metric leads, with a warm commerce accent. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-card bg-gradient-to-br from-primary-700 to-primary-800 p-5 text-white shadow-card lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-white shadow-card">
              <Wallet className="size-4" strokeWidth={2.25} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-100">
              {t("dash.payments")}
            </span>
          </div>
          <div className="tnum mt-3 text-3xl font-semibold">
            KES {data.paidKes.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-primary-100/80">collected this month</div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          <MetricCard icon={UserPlus} label={t("dash.newLeads")} value={data.newLeads} />
          <MetricCard icon={BadgeCheck} label={t("dash.qualified")} value={data.qualified} />
          <MetricCard icon={CalendarCheck} label={t("dash.booked")} value={data.booked} />
          <MetricCard icon={Send} label={t("dash.followUps")} value={data.followUpsSent} />
          <MetricCard
            icon={Undo2}
            label={t("dash.recovered")}
            value={data.recovered}
            hint="replied after a nudge"
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <CardLabel className="mb-3">Right now</CardLabel>
          <dl className="space-y-2.5 text-sm">
            <Row label="Conversations active (24h)" value={String(data.activeConversations)} />
            <Row label="Waiting for a human" value={String(data.needsHuman)} />
            <Row
              label="WhatsApp"
              dot={data.health.waConnected ? "success" : "muted"}
              value={data.health.waConnected ? "Connected" : "Not connected"}
            />
            <Row
              label="AI"
              dot={data.health.aiEnabled ? "success" : "muted"}
              value={data.health.aiEnabled ? "On" : "Off"}
            />
          </dl>
        </Card>

        <Card className="p-5">
          <CardLabel className="mb-3">Your plan</CardLabel>
          <dl className="space-y-2.5 text-sm">
            <Row label="Plan" value={data.billing.plan === "trial" ? "Free trial" : data.billing.plan} />
            {trialDaysLeft !== null && <Row label="Trial remaining" value={`${trialDaysLeft} days`} />}
            <Row
              label="AI replies this month"
              value={data.billing.usageThisMonth.llmCalls.toLocaleString()}
            />
          </dl>
        </Card>
      </div>

      {sources.length > 0 && (
        <Card className="p-5">
          <CardLabel className="mb-3">{t("dash.sources")}</CardLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Qualified</th>
                  <th className="pb-2 text-right font-medium">Booked</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source} className="border-t border-line">
                    <td className="py-2.5 pr-2 font-medium">{s.source}</td>
                    <td className="py-2.5 text-right tnum">{s.leads}</td>
                    <td className="py-2.5 text-right tnum">{s.qualified}</td>
                    <td className="py-2.5 text-right tnum">{s.booked}</td>
                    <td className="py-2.5 text-right tnum font-semibold text-primary-700">
                      {s.paidKes > 0 ? `KES ${s.paidKes.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: "success" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-muted">
        {dot && (
          <span
            className={`size-1.5 rounded-full ${dot === "success" ? "bg-success" : "bg-muted/50"}`}
          />
        )}
        {label}
      </dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto p-4 md:p-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-32 lg:col-span-1" />
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
