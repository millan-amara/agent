import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoFull } from "@/components/Logo";

/**
 * Plain public wrapper for legal pages (privacy, terms). Deliberately
 * undecorated: logo header, a readable max-w-3xl column, slim footer.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="Azayon home">
            <LogoFull className="h-8" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
          Last updated: {updated}
        </p>
        <div className="legal mt-10">{children}</div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <Link href="/" className="hover:text-ink">
              Azayon
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </div>
          <p>© 2026 Peskaya Limited</p>
        </div>
      </footer>
    </div>
  );
}
