"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, ExternalLink, Copy, Check, Send, Receipt } from "lucide-react";
import { api, type Conversation, type Invoice, type TenantInfo } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Row = { description: string; quantity: string; unitKes: string };
const emptyRow = (): Row => ({ description: "", quantity: "1", unitKes: "" });

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  pending_approval: "attention",
  pending: "attention",
  paid: "success",
  failed: "danger",
  cancelled: "neutral",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  pending: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
};

type Filter = "all" | "draft" | "pending" | "paid" | "cancelled";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

const kes = (n: number) => `KES ${n.toLocaleString()}`;
const isOverdue = (inv: Invoice) =>
  inv.status === "pending" && !!inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();

export default function InvoicesPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [contacts, setContacts] = useState<Conversation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // form state
  const [contactId, setContactId] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxPct, setTaxPct] = useState("");
  const [withPayLink, setWithPayLink] = useState(false);

  // Any team member can invoice (mirrors the inbox approve flow on the API side).
  const canInvoice = Boolean(tenant);

  const refresh = () => api.invoices().then(setInvoices).catch(() => {});
  useEffect(() => {
    api.tenant().then(setTenant).catch(() => {});
    api.conversations().then(setContacts).catch(() => {});
    refresh();
  }, []);

  // --- summary metrics (derived from the full list) ---
  const outstanding = invoices
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + i.amountKes, 0);
  const paidThisMonth = useMemo(() => {
    const now = new Date();
    return invoices
      .filter(
        (i) =>
          i.status === "paid" &&
          i.paidAt &&
          new Date(i.paidAt).getMonth() === now.getMonth() &&
          new Date(i.paidAt).getFullYear() === now.getFullYear(),
      )
      .reduce((s, i) => s + i.amountKes, 0);
  }, [invoices]);
  const overdueCount = invoices.filter(isOverdue).length;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invoices.length, draft: 0, pending: 0, paid: 0, cancelled: 0 };
    for (const i of invoices) if (i.status in c) c[i.status as Filter]++;
    return c;
  }, [invoices]);

  const visible = invoices.filter((inv) => {
    if (filter !== "all" && inv.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = `${inv.ref} ${inv.contact.name ?? ""} ${inv.contact.phone} ${inv.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // --- form math ---
  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitKes) || 0), 0),
    [rows],
  );
  const taxPctNum = Math.min(Math.max(Number(taxPct) || 0, 0), 100);
  const taxAmount = Math.round((subtotal * taxPctNum) / 100);
  const total = subtotal + taxAmount;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const openForm = () => {
    setError(null);
    setShowForm(true);
  };
  const resetForm = () => {
    setContactId("");
    setRows([emptyRow()]);
    setNotes("");
    setDueDate("");
    setTaxPct("");
    setWithPayLink(false);
    setShowForm(false);
  };

  const create = async (send: boolean) => {
    setError(null);
    const items = rows
      .map((r) => ({
        description: r.description.trim(),
        quantity: Math.round(Number(r.quantity) || 0),
        unitKes: Number(r.unitKes) || 0,
      }))
      .filter((i) => i.description && i.quantity > 0 && i.unitKes > 0);
    if (!contactId) return setError("Pick a customer.");
    if (items.length === 0) return setError("Add at least one line item with a description and amount.");
    setBusy(true);
    try {
      await api.createInvoice({
        contactId,
        items,
        notes: notes.trim() || undefined,
        dueDate: dueDate || undefined,
        taxRate: taxPctNum || undefined,
        withPayLink,
        send,
      });
      resetForm();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (id: string) => {
    setError(null);
    try {
      const res = await api.sendInvoice(id);
      if (!res.delivered) {
        setError("The 24h window is closed — the link is ready. Use Copy link and send it manually.");
      }
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const cancel = async (id: string) => {
    setError(null);
    try {
      await api.cancelInvoice(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copyLink = async (inv: Invoice) => {
    try {
      await navigator.clipboard.writeText(inv.publicUrl);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  if (!tenant) return <p className="p-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="mx-auto h-full w-full max-w-3xl space-y-5 overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Invoices"
        className="mb-0"
        actions={
          canInvoice && (
            <Button onClick={openForm}>
              <Plus className="size-4" /> New invoice
            </Button>
          )
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Outstanding</div>
          <div className="tnum mt-1 text-lg font-semibold">{kes(outstanding)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Paid this month</div>
          <div className="tnum mt-1 text-lg font-semibold text-success">{kes(paidThisMonth)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Overdue</div>
          <div className={`tnum mt-1 text-lg font-semibold ${overdueCount ? "text-danger" : ""}`}>
            {overdueCount}
          </div>
        </Card>
      </div>

      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ref or customer…"
          className="ml-auto w-44"
        />
      </div>

      <Card className="p-2 sm:p-4">
        {visible.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={invoices.length === 0 ? "No invoices yet" : "No invoices match this filter"}
            description={
              invoices.length === 0
                ? "Create one to bill a customer over WhatsApp with a pay link."
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((inv) => {
              const overdue = isOverdue(inv);
              return (
                <li
                  key={inv.id}
                  className="flex flex-col gap-2 px-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum font-semibold">{inv.ref}</span>
                      <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>
                        <span className={inv.status === "cancelled" ? "line-through" : ""}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </Badge>
                      {overdue && <Badge tone="accent">Overdue</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {inv.contact.name ?? inv.contact.phone} · {inv.description}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(inv.issuedAt ?? inv.createdAt).toLocaleDateString()}
                      {inv.dueDate && (
                        <span className={overdue ? "text-danger" : ""}>
                          {" · due "}
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                    <span className="tnum mr-1 font-semibold">{kes(inv.amountKes)}</span>
                    <a
                      href={inv.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                    >
                      <ExternalLink className="size-3.5" /> View
                    </a>
                    <button
                      onClick={() => void copyLink(inv)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                    >
                      {copiedId === inv.id ? (
                        <>
                          <Check className="size-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copy link
                        </>
                      )}
                    </button>
                    {canInvoice && inv.status !== "paid" && inv.status !== "cancelled" && (
                      <button
                        onClick={() => void send(inv.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                      >
                        <Send className="size-3.5" /> {inv.issuedAt ? "Re-send" : "Send"}
                      </button>
                    )}
                    {canInvoice && inv.status !== "paid" && inv.status !== "cancelled" && (
                      <button
                        onClick={() => void cancel(inv.id)}
                        className="text-xs font-medium text-muted hover:text-danger"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* New-invoice slide-over */}
      {canInvoice && showForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={resetForm} aria-hidden />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-pop">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface p-4">
              <h2 className="font-semibold">New invoice</h2>
              <button
                onClick={resetForm}
                className="grid size-8 place-items-center rounded-card text-muted hover:bg-canvas"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 p-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Customer</span>
                <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Choose a customer…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${c.phone})` : c.phone}
                    </option>
                  ))}
                </Select>
              </label>

              <div className="text-sm">
                <span className="mb-1 block font-medium">Line items</span>
                <div className="space-y-2">
                  {rows.map((r, i) => {
                    const lineTotal = (Number(r.quantity) || 0) * (Number(r.unitKes) || 0);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex gap-2">
                          <Input
                            value={r.description}
                            onChange={(e) => setRow(i, { description: e.target.value })}
                            placeholder="Description"
                            className="flex-1"
                          />
                          <Input
                            value={r.quantity}
                            onChange={(e) => setRow(i, { quantity: e.target.value })}
                            inputMode="numeric"
                            placeholder="Qty"
                            className="w-14 text-right"
                          />
                          <Input
                            value={r.unitKes}
                            onChange={(e) => setRow(i, { unitKes: e.target.value })}
                            inputMode="numeric"
                            placeholder="Unit KES"
                            className="w-24 text-right"
                          />
                          <button
                            onClick={() => removeRow(i)}
                            className="grid size-9 shrink-0 place-items-center rounded-card text-muted hover:bg-canvas disabled:opacity-30"
                            disabled={rows.length === 1}
                            aria-label="Remove line"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                        {lineTotal > 0 && (
                          <div className="tnum pr-11 text-right text-xs text-muted">{kes(lineTotal)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={addRow}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                >
                  <Plus className="size-3.5" /> Add line
                </button>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Due date (optional)</span>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-auto"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Tax % (optional)</span>
                  <Input
                    value={taxPct}
                    onChange={(e) => setTaxPct(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 16"
                    className="w-24 text-right"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Notes (optional)</span>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Pay within 7 days. M-Pesa Till 123456."
                />
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withPayLink}
                  onChange={(e) => setWithPayLink(e.target.checked)}
                  disabled={!tenant.paystackConfigured}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Attach a Paystack pay link</span>
                  <span className="block text-xs text-muted">
                    {tenant.paystackConfigured
                      ? "Customer can pay by M-Pesa or card from the invoice page."
                      : "Connect Paystack in Settings to enable online payment."}
                  </span>
                </span>
              </label>
            </div>

            <div className="sticky bottom-0 space-y-3 border-t border-line bg-surface p-4">
              <div className="text-sm">
                <div className="text-muted">
                  Subtotal {kes(subtotal)}
                  {taxPctNum > 0 ? ` · Tax ${taxPctNum}% (${kes(taxAmount)})` : ""}
                </div>
                <div className="text-base font-semibold">Total {kes(total)}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void create(false)} disabled={busy} className="flex-1">
                  Save draft
                </Button>
                <Button onClick={() => void create(true)} disabled={busy} className="flex-1">
                  {busy ? "Working…" : "Create & send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
