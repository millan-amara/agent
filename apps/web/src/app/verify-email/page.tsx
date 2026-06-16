"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { buttonStyles } from "@/components/ui/Button";

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

  if (state === "working")
    return (
      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Verifying…
      </p>
    );
  if (state === "ok")
    return (
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm font-medium">Your email is verified. You&apos;re all set.</p>
      </div>
    );
  return (
    <div className="mt-4 flex flex-col items-center gap-2 text-center">
      <XCircle className="size-8 text-danger" />
      <p className="text-sm text-danger">{error}</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <div className="mb-4 flex justify-center">
          <LogoFull className="h-8" />
        </div>
        <h1 className="text-lg font-semibold">Email verification</h1>
        <Suspense
          fallback={
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          }
        >
          <VerifyInner />
        </Suspense>
        <Link href="/inbox" className={`mt-6 w-full ${buttonStyles("secondary", "md")}`}>
          Go to your inbox
        </Link>
      </div>
    </div>
  );
}
