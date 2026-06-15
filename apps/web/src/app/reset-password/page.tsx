"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";

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
      <p className="mt-3 text-sm text-success">
        Password updated. Redirecting you to log in…
      </p>
    );
  }
  return (
    <form onSubmit={submit}>
      <p className="mb-5 mt-1 text-sm text-muted">Choose a new password.</p>
      {error && <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
      <label className="mb-5 block text-sm">
        <span className="mb-1 block font-medium">New password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      <button
        disabled={busy || password.length < 8}
        className="w-full rounded-card bg-primary-dark py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-primary-dark">Set a new password</h1>
        <Suspense fallback={<p className="mt-3 text-sm text-muted">Loading…</p>}>
          <ResetForm />
        </Suspense>
        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="font-medium text-primary-dark">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
