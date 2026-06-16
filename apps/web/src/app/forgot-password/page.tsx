"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="mb-5">
          <LogoFull className="h-8" />
        </div>
        <h1 className="text-lg font-semibold">Reset your password</h1>
        {sent ? (
          <>
            <div className="mt-4 flex flex-col items-center gap-2 text-center">
              <MailCheck className="size-8 text-primary-600" />
              <p className="text-sm text-muted">
                If an account exists for <span className="font-medium text-ink">{email}</span>, a
                reset link is on its way. Check your inbox — the link expires in 1 hour.
              </p>
            </div>
            <p className="mt-6 text-center text-xs text-muted">
              <Link href="/login" className="font-medium text-primary-700 hover:underline">
                Back to log in
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="mb-5 mt-1 text-sm text-muted">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            {error && (
              <p className="mb-3 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <Field label="Email" className="mb-5">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <p className="mt-4 text-center text-xs text-muted">
              <Link href="/login" className="font-medium text-primary-700 hover:underline">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
