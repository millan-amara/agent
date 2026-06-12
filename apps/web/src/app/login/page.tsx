"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

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
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-primary-dark">Azayon</h1>
        <p className="mb-5 text-sm text-muted">Log in to your workspace</p>
        {error && <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="mb-5 block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-card bg-primary-dark py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="mt-4 text-center text-xs text-muted">
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary-dark">
            Create your workspace
          </Link>
        </p>
      </form>
    </div>
  );
}
