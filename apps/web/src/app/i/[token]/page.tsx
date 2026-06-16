"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Printer } from "lucide-react";
import { api, type PublicInvoice } from "@/lib/api";
import { Logo } from "@/components/Logo";

const STATUS_NOTE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Unpaid", cls: "bg-attentionSoft text-attention" },
  paid: { label: "Paid", cls: "bg-success-soft text-success" },
  failed: { label: "Payment failed", cls: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", cls: "bg-canvas text-muted" },
  draft: { label: "Draft", cls: "bg-canvas text-muted" },
};

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .publicInvoice(token)
      .then(setInvoice)
      .catch(() => setError(true));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted">
        This invoice link is invalid or no longer available.
      </div>
    );
  }
  if (!invoice) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">Loading…</div>;
  }

  const cur = invoice.currency || "KES";
  const money = (n: number) => `${cur} ${n.toLocaleString()}`;
  const status = STATUS_NOTE[invoice.status] ?? { label: invoice.status, cls: "bg-canvas text-muted" };
  const canPay = Boolean(invoice.payUrl) && invoice.status !== "paid" && invoice.status !== "cancelled";

  return (
    <div className="min-h-screen bg-canvas p-4 md:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-xl rounded-card border border-line bg-surface p-6 shadow-panel md:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {invoice.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.logoUrl}
                alt={invoice.business}
                className="h-12 w-12 shrink-0 rounded-card object-contain"
              />
            )}
            <div>
              <div className="text-lg font-semibold">{invoice.business}</div>
              {(invoice.businessPhone || invoice.businessEmail) && (
                <div className="text-xs text-muted">
                  {[invoice.businessPhone, invoice.businessEmail].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="mt-1 text-sm text-muted tnum">{invoice.ref}</div>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.cls}`}>{status.label}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted">Billed to</div>
            <div className="font-medium">{invoice.customer}</div>
          </div>
          <div className="text-right">
            {invoice.issuedAt && (
              <div>
                <span className="text-xs text-muted">Issued </span>
                {new Date(invoice.issuedAt).toLocaleDateString()}
              </div>
            )}
            {invoice.dueDate && (
              <div>
                <span className="text-xs text-muted">Due </span>
                {new Date(invoice.dueDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right tnum">{it.quantity}</td>
                <td className="py-2 text-right tnum">{money(it.unitKes)}</td>
                <td className="py-2 text-right tnum">{money(it.lineKes)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          {invoice.taxKes > 0 && (
            <>
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="tnum">{money(invoice.amountKes - invoice.taxKes)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax{invoice.taxRate > 0 ? ` (${invoice.taxRate}%)` : ""}</span>
                <span className="tnum">{money(invoice.taxKes)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tnum">{money(invoice.amountKes)}</span>
          </div>
        </div>

        {/* How to pay (offline only — server sends payInstructions when there's no pay link) */}
        {invoice.payInstructions && invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <div className="mt-6 rounded-card border border-line bg-canvas p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">How to pay</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{invoice.payInstructions}</p>
          </div>
        )}

        {invoice.notes && <p className="mt-6 whitespace-pre-wrap text-sm text-muted">{invoice.notes}</p>}

        {invoice.status === "paid" && (
          <div className="mt-6 flex items-center gap-2 rounded-card bg-success-soft px-4 py-3 text-sm font-medium text-success">
            <Check className="size-4 shrink-0" />
            Paid{invoice.paidAt ? ` on ${new Date(invoice.paidAt).toLocaleDateString()}` : ""}. Thank you!
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3 print:hidden">
          {canPay && (
            <a
              href={invoice.payUrl!}
              className="inline-flex items-center justify-center rounded-card bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-primary-800"
            >
              Pay {money(invoice.amountKes)}
            </a>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-card border border-line px-5 py-2.5 text-sm font-semibold hover:bg-canvas"
          >
            <Printer className="size-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-1.5 text-xs text-muted print:hidden">
        Powered by <Logo size="sm" />
      </div>
    </div>
  );
}
