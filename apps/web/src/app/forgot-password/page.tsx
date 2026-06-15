"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

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
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-primary-dark">Reset your password</h1>
        {sent ? (
          <>
            <p className="mt-3 text-sm text-muted">
              If an account exists for <span className="font-medium">{email}</span>, a reset link is
              on its way. Check your inbox (the link expires in 1 hour).
            </p>
            <p className="mt-4 text-center text-xs text-muted">
              <Link href="/login" className="font-medium text-primary-dark">
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
              <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>
            )}
            <label className="mb-5 block text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
              />
            </label>
            <button
              disabled={busy}
              className="w-full rounded-card bg-primary-dark py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <p className="mt-4 text-center text-xs text-muted">
              <Link href="/login" className="font-medium text-primary-dark">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
