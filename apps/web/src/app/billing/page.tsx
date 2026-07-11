"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, type BillingStatus, type PlanOption } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

function fmtKes(n: number) {
  return "KES " + n.toLocaleString();
}

const STATE_BADGE: Record<BillingStatus["state"], { label: string; tone: BadgeTone }> = {
  trial: { label: "Free trial", tone: "primary" },
  active: { label: "Active", tone: "success" },
  over_limit: { label: "Over plan limit", tone: "attention" },
  readonly: { label: "Inactive — read only", tone: "danger" },
};

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

  const cancelPlan = async () => {
    if (!window.confirm("Cancel your subscription? Your AI keeps working until the end of the paid period.")) return;
    setBusy("cancel");
    setError(null);
    try {
      await api.cancelSubscription();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const resumePlan = async () => {
    setBusy("resume");
    setError(null);
    try {
      await api.resumeSubscription();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
  const badge = STATE_BADGE[status.state];

  return (
    <div className="mx-auto h-full w-full max-w-3xl space-y-5 overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Billing"
        className="mb-0"
        actions={
          <Badge tone={badge.tone} size="md">
            {badge.label}
          </Badge>
        }
      />

      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <Card className="p-5">
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
              {status.cancelAtPeriodEnd ? "Ends " : "Renews "}
              {new Date(status.planRenewsAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Conversations this month</span>
            <span className="tnum">
              {status.conversationCount}
              {status.limit ? ` / ${status.limit}` : ""}
            </span>
          </div>
          {status.limit ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-attention" : "bg-primary-600"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {status.state === "trial" && (
                <p className="mt-1.5 text-xs text-muted">
                  Your free trial includes {status.limit} conversations. Subscribe any time for more.
                </p>
              )}
            </>
          ) : null}
        </div>
        {status.state === "readonly" && (
          <p className="mt-4 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">
            Your account is read-only. Subscribe below to start sending and let your AI reply again.
          </p>
        )}
        {status.state === "over_limit" && (
          <p className="mt-4 rounded-card bg-warning-soft px-3 py-2 text-xs text-warning">
            {status.planTier
              ? "You've hit your plan's conversation limit — new conversations are paused until next month or an upgrade. Existing chats keep working."
              : `You've used all ${status.limit} free-trial conversations — subscribe below to let your AI keep replying to customers.`}
          </p>
        )}

        {/* Cancel / resume — only for a real paid subscription */}
        {status.planTier && (status.state === "active" || status.state === "over_limit") && (
          <div className="mt-4 border-t border-line pt-4">
            {status.cancelAtPeriodEnd ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-warning">
                  Your plan is set to end
                  {status.planRenewsAt ? ` on ${new Date(status.planRenewsAt).toLocaleDateString()}` : " at the end of this period"}
                  . You keep full access until then.
                </p>
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void resumePlan()}>
                  {busy === "resume" ? "Resuming…" : "Resume plan"}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => void cancelPlan()}
                disabled={busy !== null}
                className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel subscription"}
              </button>
            )}
          </div>
        )}
      </Card>

      {!checkoutEnabled && (
        <p className="rounded-card border border-line bg-canvas px-3 py-2 text-xs text-muted">
          Online subscription isn&apos;t switched on in this environment yet. Plans are shown for
          reference.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((p, i) => {
          const current = status.planTier === p.tier && status.state !== "readonly";
          const isPaid = Boolean(status.planTier) && status.state !== "readonly";
          const curIdx = plans.findIndex((x) => x.tier === status.planTier);
          const changeLabel = !isPaid ? "Choose" : i > curIdx ? "Upgrade" : "Downgrade";
          const popular = i === 1;
          return (
            <Card
              key={p.tier}
              className={`relative flex flex-col p-4 ${
                popular ? "ring-1 ring-accent/50" : current ? "ring-1 ring-primary/40" : ""
              }`}
            >
              {popular && !current && (
                <span className="absolute -top-2 right-3">
                  <Badge tone="accent">Most popular</Badge>
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="tnum mt-1 text-xl font-semibold">
                {fmtKes(p.priceKes)}
                <span className="text-sm font-normal text-muted">/mo</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                Up to {p.convLimit.toLocaleString()} conversations/month
              </p>
              <Button
                variant={current ? "secondary" : popular ? "accent" : "primary"}
                disabled={!checkoutEnabled || !p.available || busy !== null || current}
                onClick={() => void subscribe(p.tier)}
                className="mt-3 w-full"
              >
                {current ? (
                  <>
                    <Check className="size-4" /> Current plan
                  </>
                ) : busy === p.tier ? (
                  "Redirecting…"
                ) : (
                  changeLabel
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      {Boolean(status.planTier) && status.state !== "readonly" && (
        <p className="text-xs text-muted">
          Switching plans starts a new billing cycle at the new price (no proration). Your previous
          subscription is cancelled automatically.
        </p>
      )}
    </div>
  );
}
