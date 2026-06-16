"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, Zap, ShieldCheck } from "lucide-react";
import { api, type VerticalTemplate } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";

export default function SignupPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<VerticalTemplate[]>([]);
  const [vertical, setVertical] = useState("general");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signup({ email, password, businessName, vertical });
      router.replace("/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh">
      {/* Brand panel — desktop only */}
      <aside className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-primary-700 to-primary-900 p-12 text-white lg:flex">
        <LogoFull className="h-8" white />
        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold leading-snug tracking-tight">
            Set up once. Sell on WhatsApp every day after.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-primary-50">
            <Feature icon={Clock} text="Live in about 10 minutes" />
            <Feature icon={Zap} text="No code - just describe your business" />
            <Feature icon={ShieldCheck} text="14-day free trial, KES pricing after" />
          </ul>
        </div>
        <p className="text-xs text-primary-100/70">Built for Kenyan businesses</p>
      </aside>

      {/* Form panel */}
      <main className="flex w-full flex-col items-center justify-center bg-canvas p-6 lg:w-1/2">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <LogoFull className="h-8" />
          </div>

          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Your AI answers WhatsApp in about 10 minutes.</p>

          {error && (
            <p className="mb-4 rounded-card bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <span className="mb-1.5 block text-sm font-medium">What kind of business?</span>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setVertical(t.id)}
                className={`flex items-center gap-2 rounded-card border px-3 py-2.5 text-left text-sm transition-colors ${
                  vertical === t.id
                    ? "border-primary bg-primary-soft font-medium text-primary-700"
                    : "border-line bg-surface hover:bg-canvas"
                }`}
              >
                <span className="text-base">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <Field label="Business name">
              <Input
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. ABC Physio"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>

          <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">
            {busy ? "Creating…" : "Create workspace"}
          </Button>

          <p className="mt-6 text-center text-xs text-muted">
            Already have one?{" "}
            <Link href="/login" className="font-medium text-primary-700 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-card bg-white/10">
        <Icon className="size-4" />
      </span>
      {text}
    </li>
  );
}
