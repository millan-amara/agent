"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Field, PasswordInput } from "@/components/ui/Field";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!token) {
    return <p className="mt-3 text-sm text-danger">This reset link is missing its token.</p>;
  }
  if (done) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm font-medium">Password updated. Redirecting you to log in…</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <p className="mb-5 mt-1 text-sm text-muted">Choose a new password.</p>
      {error && (
        <p className="mb-3 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      )}
      <Field label="New password" className="mb-5">
        <PasswordInput
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy || password.length < 8} className="w-full">
        {busy ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="mb-5">
          <LogoFull className="h-8" />
        </div>
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <Suspense fallback={<p className="mt-3 text-sm text-muted">Loading…</p>}>
          <ResetForm />
        </Suspense>
        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="font-medium text-primary-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
