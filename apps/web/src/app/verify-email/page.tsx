"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

function VerifyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch((err) => {
        setState("error");
        setError((err as Error).message);
      });
  }, [token]);

  if (state === "working") return <p className="mt-3 text-sm text-muted">Verifying…</p>;
  if (state === "ok")
    return (
      <p className="mt-3 text-sm text-success">
        ✅ Your email is verified. You&apos;re all set.
      </p>
    );
  return <p className="mt-3 text-sm text-danger">{error}</p>;
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-primary-dark">Email verification</h1>
        <Suspense fallback={<p className="mt-3 text-sm text-muted">Loading…</p>}>
          <VerifyInner />
        </Suspense>
        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/inbox" className="font-medium text-primary-dark">
            Go to your inbox
          </Link>
        </p>
      </div>
    </div>
  );
}
