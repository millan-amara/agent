"use client";

import { useEffect, useState } from "react";
import {
  api,
  type BookingSettings,
  type BusinessProfile,
  type FollowUpSettings,
  type MessageTemplate,
  type TenantInfo,
} from "@/lib/api";
import { ProfileForm } from "@/components/ProfileForm";
import { TemplateManager } from "@/components/TemplateManager";

const SETTINGS_TABS = [
  { id: "ai", label: "Your AI" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "automation", label: "Automation" },
  { id: "payments", label: "Payments" },
  { id: "account", label: "Account" },
] as const;
type TabId = (typeof SETTINGS_TABS)[number]["id"];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("ai");
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  const [followUps, setFollowUps] = useState<FollowUpSettings | null>(null);
  const [fuTemplates, setFuTemplates] = useState<MessageTemplate[]>([]);
  const [fuMsg, setFuMsg] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingSettings | null>(null);
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [paystackKey, setPaystackKey] = useState("");
  const [paystackMsg, setPaystackMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .tenant()
      .then((t) => {
        setTenant(t);
        setFollowUps(t.followUps);
        setBooking(t.booking);
      })
      .catch(() => {});
    api.messageTemplates().then(setFuTemplates).catch(() => {});
  }, []);

  if (!tenant) return <p className="p-6 text-sm text-muted">Loading…</p>;

  const save = async (profile: BusinessProfile) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.saveProfile({ profile });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.connectWhatsApp({
        phoneNumberId,
        accessToken,
        wabaId: wabaId || undefined,
      });
      setConnectMsg(`Connected: ${res.name} (${res.number})`);
      setTenant({ ...tenant, waConnected: true, wabaConfigured: tenant.wabaConfigured || !!wabaId });
      setPhoneNumberId("");
      setAccessToken("");
      setWabaId("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto h-full max-w-2xl space-y-4 overflow-y-auto p-4">
      <nav className="flex gap-1.5 overflow-x-auto pb-1">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              tab === t.id
                ? "bg-primary-dark text-white"
                : "border border-line bg-white text-muted hover:bg-canvas"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

      {tab === "whatsapp" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-1 font-semibold">WhatsApp connection</h2>
        {tenant.waConnected ? (
          <p className="text-sm text-success">✅ Connected — customers reach your AI on WhatsApp.</p>
        ) : (
          <p className="text-sm text-muted">Not connected yet.</p>
        )}
        {connectMsg && <p className="mt-1 text-sm text-success">{connectMsg}</p>}
        <form onSubmit={connect} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Phone number ID"
              className="tnum rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Access token"
              className="rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="WhatsApp Business Account ID (for templates)"
              className="tnum rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2"
            />
          </div>
          <button
            disabled={saving || !phoneNumberId || !accessToken}
            className="rounded-card border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
          >
            {tenant.waConnected ? "Update connection" : "Connect"}
          </button>
        </form>
      </section>
      )}

      {tab === "automation" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-1 font-semibold">Appointment booking</h2>
        <p className="mb-3 text-xs text-muted">
          When enabled, the AI offers real slots from this calendar and books them in chat.
        </p>
        {bookingMsg && (
          <p className="mb-3 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">
            {bookingMsg}
          </p>
        )}
        {booking && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBookingMsg(null);
              try {
                await api.saveBooking(booking);
                setBookingMsg("Booking settings saved.");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="space-y-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={booking.enabled}
                onChange={(e) => setBooking({ ...booking, enabled: e.target.checked })}
              />
              <span className="font-medium">Let the AI book appointments</span>
            </label>
            <div className="flex gap-4">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Slot length (min)</span>
                <input
                  type="number"
                  value={booking.slotMinutes}
                  onChange={(e) => setBooking({ ...booking, slotMinutes: Number(e.target.value) })}
                  className="tnum w-24 rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Book up to (days ahead)</span>
                <input
                  type="number"
                  value={booking.daysAhead}
                  onChange={(e) => setBooking({ ...booking, daysAhead: Number(e.target.value) })}
                  className="tnum w-24 rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
                />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium">Weekly hours</span>
              <div className="space-y-1.5">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, d) => {
                  const h = booking.hours[String(d)];
                  return (
                    <div key={d} className="flex items-center gap-2 text-sm">
                      <label className="flex w-20 items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={Boolean(h)}
                          onChange={(e) =>
                            setBooking({
                              ...booking,
                              hours: {
                                ...booking.hours,
                                [String(d)]: e.target.checked
                                  ? { start: "09:00", end: "17:00" }
                                  : null,
                              },
                            })
                          }
                        />
                        {label}
                      </label>
                      {h && (
                        <>
                          <input
                            value={h.start}
                            onChange={(e) =>
                              setBooking({
                                ...booking,
                                hours: {
                                  ...booking.hours,
                                  [String(d)]: { ...h, start: e.target.value },
                                },
                              })
                            }
                            className="tnum w-20 rounded-card border border-line px-2 py-1 outline-none focus:border-primary"
                          />
                          <span className="text-muted">–</span>
                          <input
                            value={h.end}
                            onChange={(e) =>
                              setBooking({
                                ...booking,
                                hours: {
                                  ...booking.hours,
                                  [String(d)]: { ...h, end: e.target.value },
                                },
                              })
                            }
                            className="tnum w-20 rounded-card border border-line px-2 py-1 outline-none focus:border-primary"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="rounded-card bg-primary-dark px-4 py-2 text-sm font-semibold text-white">
              Save booking settings
            </button>
          </form>
        )}
      </section>
      )}

      {tab === "payments" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-1 font-semibold">Payments (Paystack)</h2>
        <p className="mb-3 text-xs text-muted">
          Connect your Paystack account and the AI can collect payment in chat — M-Pesa or card —
          when a customer agrees to buy.
        </p>
        {tenant.paystackConfigured && (
          <p className="mb-3 text-sm text-success">✅ Connected — in-chat payments are on.</p>
        )}
        {paystackMsg && (
          <p className="mb-3 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">
            {paystackMsg}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPaystackMsg(null);
            setError(null);
            try {
              await api.savePaystack(paystackKey);
              setPaystackMsg("Paystack connected.");
              setTenant({ ...tenant, paystackConfigured: true });
              setPaystackKey("");
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          className="flex gap-2"
        >
          <input
            type="password"
            value={paystackKey}
            onChange={(e) => setPaystackKey(e.target.value)}
            placeholder="Paystack secret key (sk_live_... or sk_test_...)"
            className="flex-1 rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={!paystackKey}
            className="rounded-card border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
          >
            {tenant.paystackConfigured ? "Update" : "Connect"}
          </button>
        </form>
      </section>
      )}

      {tab === "whatsapp" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-3 font-semibold">Message templates</h2>
        <TemplateManager wabaConfigured={tenant.wabaConfigured} />
      </section>
      )}

      {tab === "automation" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-1 font-semibold">Automatic follow-ups</h2>
        <p className="mb-3 text-xs text-muted">
          When a customer goes quiet after your last message, Azayon checks in for you — a natural
          AI message inside the 24h window, your approved template after it.
        </p>
        {fuMsg && (
          <p className="mb-3 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">{fuMsg}</p>
        )}
        {followUps && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setFuMsg(null);
              try {
                await api.saveFollowUps(followUps);
                setFuMsg("Follow-up settings saved.");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="space-y-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={followUps.enabled}
                onChange={(e) => setFollowUps({ ...followUps, enabled: e.target.checked })}
              />
              <span className="font-medium">Follow up automatically when customers go quiet</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Check-in schedule (hours after silence)</span>
              <input
                value={followUps.delaysHours.join(", ")}
                onChange={(e) =>
                  setFollowUps({
                    ...followUps,
                    delaysHours: e.target.value
                      .split(",")
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  })
                }
                placeholder="24, 72"
                className="tnum w-48 rounded-card border border-line px-3 py-2 outline-none focus:border-primary"
              />
              <span className="mt-1 block text-xs text-muted">
                e.g. &quot;24, 72&quot; = first nudge after a day, second after three more days,
                then stop.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Template for closed-window follow-ups
              </span>
              <select
                value={followUps.templateId}
                onChange={(e) => setFollowUps({ ...followUps, templateId: e.target.value })}
                className="w-full max-w-md rounded-card border border-line bg-white px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">None — skip when the 24h window is closed</option>
                {fuTemplates
                  .filter((t) => t.status === "approved")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              {fuTemplates.every((t) => t.status !== "approved") && (
                <span className="mt-1 block text-xs text-muted">
                  No approved templates yet — create and submit one above.
                </span>
              )}
            </label>
            <button className="rounded-card bg-primary-dark px-4 py-2 text-sm font-semibold text-white">
              Save follow-up settings
            </button>
          </form>
        )}
      </section>
      )}

      {tab === "account" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-3 font-semibold">Account</h2>
        <PasswordForm />
      </section>
      )}

      {tab === "ai" && (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="mb-3 font-semibold">Tell Azayon how to reply</h2>
        {error && <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
        {saved && (
          <p className="mb-3 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">
            Saved — the AI uses the new info immediately. Try it in the Simulator.
          </p>
        )}
        <ProfileForm initial={tenant.profile} saving={saving} submitLabel="Save changes" onSubmit={(p) => void save(p)} />
      </section>
      )}
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        try {
          await api.changePassword({ current, next });
          setMsg("Password changed.");
          setCurrent("");
          setNext("");
        } catch (error) {
          setErr((error as Error).message);
        }
      }}
      className="space-y-3"
    >
      {msg && <p className="rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">{msg}</p>}
      {err && <p className="rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          className="rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (min 8 characters)"
          className="rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <button
        disabled={!current || next.length < 8}
        className="rounded-card border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
      >
        Change password
      </button>
    </form>
  );
}
