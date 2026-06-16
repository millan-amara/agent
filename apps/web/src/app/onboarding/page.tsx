"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { api, type BusinessProfile, type TenantInfo } from "@/lib/api";
import { ProfileForm } from "@/components/ProfileForm";
import { SimulatorChat } from "@/components/SimulatorChat";
import { EmbeddedSignup } from "@/components/EmbeddedSignup";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput } from "@/components/ui/Field";

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
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="text-xs text-muted">Setting up {tenant.name}</span>
        </div>

        {/* Step indicator with connectors */}
        <ol className="mb-8 flex items-center">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} className="flex flex-1 items-center last:flex-none">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${
                      done
                        ? "bg-primary-700 text-white"
                        : current
                          ? "bg-primary-soft text-primary-700 ring-2 ring-primary/40"
                          : "bg-line/60 text-muted"
                    }`}
                  >
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span
                    className={`hidden text-xs font-medium sm:block ${
                      current ? "text-ink" : "text-muted"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={`mx-3 h-px flex-1 ${done ? "bg-primary-400" : "bg-line"}`}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="mb-4 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
        )}

        {step === 0 && (
          <div className="rounded-card border border-line bg-surface p-5 shadow-card md:p-6">
            <h2 className="mb-1 text-lg font-semibold">Teach your AI about your business</h2>
            <p className="mb-5 text-sm text-muted">
              The more you share, the better it answers. You can refine all of this later.
            </p>
            <ProfileForm
              initial={tenant.profile}
              saving={saving}
              submitLabel="Save & try your AI"
              onSubmit={(p) => void saveProfile(p)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Try your AI</h2>
              <p className="mt-1 text-sm text-muted">
                This is your AI, built from what you just wrote. Ask about prices, hours, or
                booking — watch the ⚡ markers as it works your CRM. Not right? Go back and adjust.
              </p>
            </div>
            <SimulatorChat />
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft className="size-4" /> Edit business info
              </Button>
              <Button onClick={() => setStep(2)}>
                Looks good <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Connect WhatsApp</h2>
              <p className="mt-1 text-sm text-muted">
                The last step — link your number so customers reach your AI.
              </p>
            </div>
            <div className="rounded-card border border-line bg-surface p-5 shadow-card md:p-6">
              {connected ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="size-5" /> Connected: {connected}
                </p>
              ) : (
                <div className="space-y-3">
                  <EmbeddedSignup onConnected={setConnected} />
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-px flex-1 bg-line" /> or connect manually{" "}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <form onSubmit={connect} className="space-y-3">
                    <p className="text-sm text-muted">
                      Connect your WhatsApp Business number via the Meta developer dashboard. You
                      need the <strong>Phone number ID</strong> (WhatsApp → API Setup) and a
                      permanent <strong>access token</strong>.
                    </p>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Phone number ID</span>
                      <Input
                        className="tnum"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Access token</span>
                      <PasswordInput
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                      />
                    </label>
                    <Button type="submit" disabled={saving || !phoneNumberId || !accessToken}>
                      {saving ? "Verifying…" : "Connect"}
                    </Button>
                  </form>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button onClick={() => void finish()} disabled={saving}>
                {connected ? "Go to my inbox" : "Skip for now"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
