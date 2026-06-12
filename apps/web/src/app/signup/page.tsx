"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type VerticalTemplate } from "@/lib/api";

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
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-card border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-primary-dark">Create your Azayon workspace</h1>
        <p className="mb-5 text-sm text-muted">Your AI answers WhatsApp in about 10 minutes.</p>
        {error && <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

        <span className="mb-1 block text-sm font-medium">What kind of business?</span>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setVertical(t.id)}
              className={`rounded-card border px-3 py-2 text-left text-sm ${
                vertical === t.id
                  ? "border-primary bg-primary-soft font-medium text-primary-dark"
                  : "border-line hover:bg-canvas"
              }`}
            >
              <span className="mr-1.5">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Business name</span>
          <input
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. ABC Physio"
            className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
          />
        </label>
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-card bg-primary-dark py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create workspace"}
        </button>
        <p className="mt-4 text-center text-xs text-muted">
          Already have one?{" "}
          <Link href="/login" className="font-medium text-primary-dark">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
