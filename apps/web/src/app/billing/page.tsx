"use client";

import { useEffect, useState } from "react";
import { api, type BillingStatus, type PlanOption } from "@/lib/api";

function fmtKes(n: number) {
  return "KES " + n.toLocaleString();
}

function StateBadge({ s }: { s: BillingStatus["state"] }) {
  const map: Record<BillingStatus["state"], { label: string; cls: string }> = {
    trial: { label: "Free trial", cls: "bg-primary-soft text-primary-dark" },
    active: { label: "Active", cls: "bg-green-50 text-success" },
    over_limit: { label: "Over plan limit", cls: "bg-amber-50 text-warning" },
    readonly: { label: "Inactive — read only", cls: "bg-red-50 text-danger" },
  };
  const m = map[s];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .billing()
      .then((b) => {
        setStatus(b.status);
        setPlans(b.plans);
        setCheckoutEnabled(b.checkoutEnabled);
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const subscribe = async (tier: string) => {
    setBusy(tier);
    setError(null);
    try {
      const { url } = await api.subscribe(tier);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (!status) return <p className="p-6 text-sm text-muted">Loading…</p>;

  const trialDaysLeft = status.trialEndsAt
    ? Math.ceil((new Date(status.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const pct =
    status.limit && status.limit > 0
      ? Math.min(100, Math.round((status.conversationCount / status.limit) * 100))
      : 0;

  return (
    <div className="mx-auto h-full w-full max-w-3xl space-y-4 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Billing</h1>
        <StateBadge s={status.state} />
      </div>

      {error && <p className="rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

      <section className="rounded-card border border-line bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">
            {status.planTier
              ? plans.find((p) => p.tier === status.planTier)?.name + " plan"
              : "Free trial"}
          </h2>
          {status.state === "trial" && trialDaysLeft !== null && (
            <span className="text-sm text-muted">
              {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left` : "Ended"}
            </span>
          )}
          {status.state === "active" && status.planRenewsAt && (
            <span className="text-sm text-muted">
              Renews {new Date(status.planRenewsAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Conversations this month</span>
            <span className="tnum">
              {status.conversationCount}
              {status.limit ? ` / ${status.limit}` : ""}
            </span>
          </div>
          {status.limit ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
              <div
                className={`h-full ${pct >= 100 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : (
            <p className="text-xs text-muted">Unlimited during your trial.</p>
          )}
        </div>
        {status.state === "readonly" && (
          <p className="mt-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">
            Your account is read-only. Subscribe below to start sending and let your AI reply again.
          </p>
        )}
        {status.state === "over_limit" && (
          <p className="mt-3 rounded-card bg-amber-50 px-3 py-2 text-xs text-warning">
            You&apos;ve hit your plan&apos;s conversation limit — new conversations are paused until
            next month or an upgrade. Existing chats keep working.
          </p>
        )}
      </section>

      {!checkoutEnabled && (
        <p className="rounded-card border border-line bg-canvas px-3 py-2 text-xs text-muted">
          Online subscription isn&apos;t switched on in this environment yet. Plans are shown for
          reference.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((p) => {
          const current = status.planTier === p.tier && status.state !== "readonly";
          return (
            <div
              key={p.tier}
              className={`rounded-card border bg-white p-4 ${
                current ? "border-primary" : "border-line"
              }`}
            >
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-xl font-semibold tnum">
                {fmtKes(p.priceKes)}
                <span className="text-sm font-normal text-muted">/mo</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                Up to {p.convLimit.toLocaleString()} conversations/month
              </p>
              <button
                disabled={!checkoutEnabled || !p.available || busy !== null || current}
                onClick={() => void subscribe(p.tier)}
                className="mt-3 w-full rounded-card bg-primary-dark py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {current ? "Current plan" : busy === p.tier ? "Redirecting…" : "Choose"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
