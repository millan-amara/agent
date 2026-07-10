"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Clock, Mail, Phone } from "lucide-react";
import { api, type PublicBusiness } from "@/lib/api";
import { Logo } from "@/components/Logo";

export default function PublicBusinessPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [biz, setBiz] = useState<PublicBusiness | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.publicBusiness(slug).then(setBiz).catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted">
        This page isn’t available.
      </div>
    );
  }
  if (!biz) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-canvas p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header card */}
        <div className="rounded-card border border-line bg-surface p-6 shadow-panel md:p-8">
          <div className="flex items-start gap-4">
            {biz.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={biz.logoUrl}
                alt={biz.name}
                className="size-16 shrink-0 rounded-card border border-line object-contain"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{biz.name}</h1>
              {biz.description && <p className="mt-1 text-sm text-muted">{biz.description}</p>}
            </div>
          </div>

          {biz.waLink ? (
            <a
              href={biz.waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-card bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-90"
            >
              <WhatsAppIcon /> Chat with us on WhatsApp
            </a>
          ) : (
            <div className="mt-5 rounded-card border border-dashed border-line px-4 py-3 text-center text-sm text-muted">
              WhatsApp chat is being set up.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
            {biz.hours && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {biz.hours}
              </span>
            )}
            {biz.phone && (
              <a href={`tel:${biz.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Phone className="size-4" /> {biz.phone}
              </a>
            )}
            {biz.email && (
              <a href={`mailto:${biz.email}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Mail className="size-4" /> {biz.email}
              </a>
            )}
          </div>
        </div>

        {/* Services */}
        {biz.services.length > 0 && (
          <div className="rounded-card border border-line bg-surface p-6 shadow-panel">
            <h2 className="mb-3 font-semibold">What we offer</h2>
            <ul className="divide-y divide-line">
              {biz.services.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>{s.name}</span>
                  {s.price && <span className="shrink-0 font-medium tnum">{s.price}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* FAQs */}
        {biz.faqs.length > 0 && (
          <div className="rounded-card border border-line bg-surface p-6 shadow-panel">
            <h2 className="mb-3 font-semibold">Questions & answers</h2>
            <div className="space-y-4">
              {biz.faqs.map((f, i) => (
                <div key={i}>
                  <div className="text-sm font-medium">{f.q}</div>
                  <div className="mt-0.5 text-sm text-muted">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {biz.waLink && (
          <a
            href={biz.waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-card bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            <WhatsAppIcon /> Message {biz.name}
          </a>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted">
          Powered by <Logo size="sm" />
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.548 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
