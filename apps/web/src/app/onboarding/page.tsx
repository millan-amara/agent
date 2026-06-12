"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type BusinessProfile, type TenantInfo } from "@/lib/api";
import { ProfileForm } from "@/components/ProfileForm";
import { SimulatorChat } from "@/components/SimulatorChat";

const STEPS = ["Your business", "Try your AI", "Connect WhatsApp"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp connect form
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connected, setConnected] = useState<string | null>(null);

  useEffect(() => {
    api
      .tenant()
      .then(setTenant)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!tenant) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted">Loading…</div>;
  }

  const saveProfile = async (profile: BusinessProfile) => {
    setSaving(true);
    setError(null);
    try {
      await api.saveProfile({ profile });
      setTenant({ ...tenant, profile });
      setStep(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.connectWhatsApp({ phoneNumberId, accessToken });
      setConnected(`${res.name} (${res.number})`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await api.saveProfile({ profile: tenant.profile, completeOnboarding: true });
      router.replace("/inbox");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-lg font-semibold text-primary-dark">Set up {tenant.name}</h1>

        {/* Step indicator */}
        <ol className="mb-6 mt-3 flex gap-2">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                i === step
                  ? "bg-primary-soft text-primary-dark"
                  : i < step
                    ? "text-success"
                    : "text-muted"
              }`}
            >
              <span>{i < step ? "✓" : `${i + 1}.`}</span>
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <p className="mb-4 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>
        )}

        {step === 0 && (
          <div className="rounded-card border border-line bg-white p-5">
            <ProfileForm
              initial={tenant.profile}
              saving={saving}
              submitLabel="Save & try your AI →"
              onSubmit={(p) => void saveProfile(p)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              This is your AI, built from what you just wrote. Ask it about prices, opening hours,
              or booking — watch the ⚡ markers as it works your CRM. Not right? Go back and adjust.
            </p>
            <SimulatorChat />
            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className="text-sm font-medium text-muted">
                ← Edit business info
              </button>
              <button
                onClick={() => setStep(2)}
                className="rounded-card bg-primary-dark px-5 py-2 text-sm font-semibold text-white"
              >
                Looks good →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-card border border-line bg-white p-5">
              {connected ? (
                <p className="text-sm">
                  ✅ Connected: <span className="font-medium">{connected}</span>
                </p>
              ) : (
                <form onSubmit={connect} className="space-y-3">
                  <p className="text-sm text-muted">
                    Connect your WhatsApp Business number via the Meta developer dashboard. You
                    need the <strong>Phone number ID</strong> (WhatsApp → API Setup) and a
                    permanent <strong>access token</strong>. One-click connection is coming; for
                    now we&apos;ll wire it manually.
                  </p>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Phone number ID</span>
                    <input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="tnum w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Access token</span>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
                    />
                  </label>
                  <button
                    disabled={saving || !phoneNumberId || !accessToken}
                    className="rounded-card bg-primary-dark px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Verifying…" : "Connect"}
                  </button>
                </form>
              )}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="text-sm font-medium text-muted">
                ← Back
              </button>
              <button
                onClick={() => void finish()}
                disabled={saving}
                className="rounded-card bg-primary-dark px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {connected ? "Go to my inbox →" : "Skip for now — go to my inbox →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
