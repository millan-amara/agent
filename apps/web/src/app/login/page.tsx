"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquareText, CalendarCheck, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login({ email, password });
      router.replace("/inbox");
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
            Your WhatsApp, answered - even while you sleep.
          </h2>
          <p className="mt-3 text-sm text-primary-100">
            Azayon captures every lead, books appointments, and chases payments automatically.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-primary-50">
            <Feature icon={MessageSquareText} text="Automated replies in seconds, day and night" />
            <Feature icon={CalendarCheck} text="Bookings straight into your calendar" />
            <Feature icon={Receipt} text="Invoices and payments over chat" />
          </ul>
        </div>
        <p className="text-xs text-primary-100/70">Built for Your Businesses</p>
      </aside>

      {/* Form panel */}
      <main className="flex w-full flex-col items-center justify-center bg-canvas p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoFull className="h-8" />
          </div>

          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Log in to your workspace</p>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <p className="rounded-card bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                {error}
              </p>
            )}
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-xs text-muted">
            <p>
              <Link href="/forgot-password" className="font-medium text-primary-700 hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p>
              New here?{" "}
              <Link href="/signup" className="font-medium text-primary-700 hover:underline">
                Create your workspace
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof MessageSquareText; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-card bg-white/10">
        <Icon className="size-4" />
      </span>
      {text}
    </li>
  );
}
