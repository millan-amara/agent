"use client";

import { useEffect, useState } from "react";
import {
  api,
  type BookingSettings,
  type BusinessProfile,
  type DigestSettings,
  type FollowUpSettings,
  type InvoiceBranding,
  type MessageTemplate,
  type OwnerChatSettings,
  type PublicPageSettings,
  type TenantInfo,
} from "@/lib/api";
import {
  Bot,
  BookOpen,
  MessageCircle,
  Zap,
  CreditCard,
  Users,
  ShieldCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { ProfileForm } from "@/components/ProfileForm";
import { TemplateManager } from "@/components/TemplateManager";
import { KnowledgeBase } from "@/components/KnowledgeBase";
import { TeamManager } from "@/components/TeamManager";
import { EmbeddedSignup } from "@/components/EmbeddedSignup";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input, PasswordInput, Textarea, Select } from "@/components/ui/Field";

const SETTINGS_TABS = [
  { id: "ai", label: "Your AI", Icon: Bot },
  { id: "knowledge", label: "Knowledge", Icon: BookOpen },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { id: "automation", label: "Automation", Icon: Zap },
  { id: "payments", label: "Payments", Icon: CreditCard },
  { id: "team", label: "Team", Icon: Users },
  { id: "account", label: "Account", Icon: ShieldCheck },
] as const;
type TabId = (typeof SETTINGS_TABS)[number]["id"];

const CHECKBOX = "mt-0.5 size-4 shrink-0 accent-primary-700";

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

  const [digest, setDigest] = useState<DigestSettings | null>(null);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
  const [digestPreview, setDigestPreview] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const [ownerChat, setOwnerChat] = useState<OwnerChatSettings | null>(null);
  const [ownerChatMsg, setOwnerChatMsg] = useState<string | null>(null);

  const [publicPage, setPublicPage] = useState<PublicPageSettings | null>(null);
  const [publicMsg, setPublicMsg] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingSettings | null>(null);
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [paystackKey, setPaystackKey] = useState("");
  const [paystackMsg, setPaystackMsg] = useState<string | null>(null);
  const [branding, setBranding] = useState({
    logoUrl: "",
    businessPhone: "",
    businessEmail: "",
    payInstructions: "",
  });
  const [brandingMsg, setBrandingMsg] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [cap, setCap] = useState<string>("");
  const [retention, setRetention] = useState<string>("");
  const [complianceMsg, setComplianceMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .tenant()
      .then((t) => {
        setTenant(t);
        setFollowUps(t.followUps);
        setDigest(t.digest);
        setOwnerChat(t.ownerChat);
        setPublicPage(t.publicPage);
        setBooking(t.booking);
        setCap(t.compliance.dailyMessageCap?.toString() ?? "");
        setRetention(t.compliance.dataRetentionDays?.toString() ?? "");
        setBranding({
          logoUrl: t.branding?.logoUrl ?? "",
          businessPhone: t.branding?.businessPhone ?? "",
          businessEmail: t.branding?.businessEmail ?? "",
          payInstructions: t.branding?.payInstructions ?? "",
        });
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
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="md:flex md:gap-8">
        <nav className="mb-4 flex shrink-0 gap-1 overflow-x-auto pb-1 md:mb-0 md:w-56 md:flex-col md:overflow-visible md:pb-0">
          {SETTINGS_TABS.map((s) => {
            const isActive = tab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-card px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary-soft text-primary-700"
                    : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <s.Icon className="size-4 shrink-0" strokeWidth={2} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          {tab === "ai" && (
            <Section title="Tell Azayon how to reply">
              {saved && <Notice>Saved — the AI uses the new info immediately. Try it in the Simulator.</Notice>}
              <ProfileForm
                initial={tenant.profile}
                saving={saving}
                submitLabel="Save changes"
                onSubmit={(p) => void save(p)}
              />
            </Section>
          )}

          {tab === "knowledge" && (
            <Section title="Knowledge base">
              <KnowledgeBase />
            </Section>
          )}

          {tab === "whatsapp" && (
            <>
              <Section title="WhatsApp connection">
                {tenant.waConnected ? (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2 className="size-4" /> Connected — customers reach your AI on WhatsApp.
                  </p>
                ) : (
                  <p className="text-sm text-muted">Not connected yet.</p>
                )}
                {tenant.waConnected && <HealthPill health={tenant.health} />}
                {connectMsg && <p className="mt-1 text-sm text-success">{connectMsg}</p>}
                <div className="mt-4">
                  <EmbeddedSignup
                    onConnected={(label) => {
                      setConnectMsg(`Connected: ${label}`);
                      setTenant({ ...tenant, waConnected: true, wabaConfigured: true });
                    }}
                  />
                </div>
                <form onSubmit={connect} className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      className="tnum"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Phone number ID"
                    />
                    <PasswordInput
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="Access token"
                    />
                    <Input
                      className="tnum sm:col-span-2"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="WhatsApp Business Account ID (for templates)"
                    />
                  </div>
                  <Button type="submit" variant="secondary" disabled={saving || !phoneNumberId || !accessToken}>
                    {tenant.waConnected ? "Update connection" : "Connect"}
                  </Button>
                </form>
              </Section>

              <Section title="Message templates">
                <TemplateManager wabaConfigured={tenant.wabaConfigured} />
              </Section>

              <Section
                title="Public page"
                description="A simple public page for your business — your services, hours and a “Chat on WhatsApp” button that drops customers straight into your AI. Share the link anywhere: bio, posters, ads."
              >
                {publicMsg && <Notice className="mb-3">{publicMsg}</Notice>}
                {publicPage && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setPublicMsg(null);
                      setError(null);
                      try {
                        const res = await api.savePublicPage({
                          enabled: publicPage.enabled,
                          slug: publicPage.slug,
                        });
                        setPublicPage({ ...publicPage, slug: res.slug, url: res.url });
                        setPublicMsg("Public page saved.");
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                    className="space-y-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-700"
                        checked={publicPage.enabled}
                        onChange={(e) => setPublicPage({ ...publicPage, enabled: e.target.checked })}
                      />
                      <span className="font-medium">Publish my business page</span>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Page address</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted">/b/</span>
                        <Input
                          className="w-56"
                          value={publicPage.slug}
                          onChange={(e) => setPublicPage({ ...publicPage, slug: e.target.value })}
                          placeholder="my-salon"
                        />
                      </div>
                      <span className="mt-1 block text-xs text-muted">
                        Letters and numbers. This becomes your shareable link.
                      </span>
                    </label>
                    {!publicPage.waConnected && (
                      <p className="rounded-card bg-attentionSoft px-3 py-2 text-xs text-attention">
                        Connect WhatsApp above so the page’s “Chat” button can reach your AI.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="submit">Save public page</Button>
                      {publicPage.url && publicPage.enabled && (
                        <>
                          <a
                            href={publicPage.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonStyles("secondary", "md")}
                          >
                            <ExternalLink className="size-4" /> View
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard?.writeText(publicPage.url);
                              setPublicMsg("Link copied.");
                            }}
                          >
                            <Copy className="size-4" /> Copy link
                          </Button>
                        </>
                      )}
                    </div>
                    {publicPage.url && publicPage.enabled && (
                      <p className="break-all text-xs text-muted">{publicPage.url}</p>
                    )}
                  </form>
                )}
              </Section>
            </>
          )}

          {tab === "automation" && (
            <>
              <Section
                title="Appointment booking"
                description="When enabled, the AI offers real slots from this calendar and books them in chat."
              >
                <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-line bg-canvas px-3 py-2.5">
                  <div>
                    <span className="text-sm font-medium">Google Calendar</span>
                    <p className="text-xs text-muted">
                      {tenant.googleConnected
                        ? "Connected — bookings sync both ways."
                        : "Sync bookings to your calendar and block busy times."}
                    </p>
                  </div>
                  {tenant.googleConnected ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await api.disconnectGoogle().catch(() => {});
                        setTenant({ ...tenant, googleConnected: false });
                      }}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <a href={api.googleAuthUrl()} className={buttonStyles("primary", "sm")}>
                      Connect
                    </a>
                  )}
                </div>
                {bookingMsg && <Notice>{bookingMsg}</Notice>}
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
                    className="space-y-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-700"
                        checked={booking.enabled}
                        onChange={(e) => setBooking({ ...booking, enabled: e.target.checked })}
                      />
                      <span className="font-medium">Let the AI book appointments</span>
                    </label>
                    <div className="flex gap-4">
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Slot length (min)</span>
                        <Input
                          type="number"
                          className="tnum w-24"
                          value={booking.slotMinutes}
                          onChange={(e) => setBooking({ ...booking, slotMinutes: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Book up to (days ahead)</span>
                        <Input
                          type="number"
                          className="tnum w-24"
                          value={booking.daysAhead}
                          onChange={(e) => setBooking({ ...booking, daysAhead: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <div>
                      <span className="mb-1.5 block text-sm font-medium">Weekly hours</span>
                      <div className="space-y-1.5">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, d) => {
                          const h = booking.hours[String(d)];
                          return (
                            <div key={d} className="flex items-center gap-2 text-sm">
                              <label className="flex w-20 items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary-700"
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
                                  <Input
                                    className="tnum w-20 px-2 py-1"
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
                                  />
                                  <span className="text-muted">–</span>
                                  <Input
                                    className="tnum w-20 px-2 py-1"
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
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <Button type="submit">Save booking settings</Button>
                  </form>
                )}
              </Section>

              <Section
                title="Automatic follow-ups"
                description="When a customer goes quiet after your last message, Azayon checks in for you — a natural AI message inside the 24h window, your approved template after it."
              >
                {fuMsg && <Notice>{fuMsg}</Notice>}
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
                    className="space-y-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-700"
                        checked={followUps.enabled}
                        onChange={(e) => setFollowUps({ ...followUps, enabled: e.target.checked })}
                      />
                      <span className="font-medium">Follow up automatically when customers go quiet</span>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Check-in schedule (hours after silence)</span>
                      <Input
                        className="tnum w-48"
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
                      />
                      <span className="mt-1 block text-xs text-muted">
                        e.g. &quot;24, 72&quot; = first nudge after a day, second after three more days,
                        then stop.
                      </span>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Template for closed-window follow-ups</span>
                      <Select
                        className="max-w-md"
                        value={followUps.templateId}
                        onChange={(e) => setFollowUps({ ...followUps, templateId: e.target.value })}
                      >
                        <option value="">None — skip when the 24h window is closed</option>
                        {fuTemplates
                          .filter((t) => t.status === "approved")
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </Select>
                      {fuTemplates.every((t) => t.status !== "approved") && (
                        <span className="mt-1 block text-xs text-muted">
                          No approved templates yet — create and submit one above.
                        </span>
                      )}
                    </label>
                    <Button type="submit">Save follow-up settings</Button>
                  </form>
                )}
              </Section>

              <Section
                title="Chat with your business"
                description="Message your own WhatsApp number and ask about leads, invoices, appointments and what needs you — a private assistant only you can reach. Read-only for now (it looks things up; it doesn't change anything yet)."
              >
                {ownerChatMsg && <Notice>{ownerChatMsg}</Notice>}
                {ownerChat && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setOwnerChatMsg(null);
                      setError(null);
                      try {
                        await api.saveOwnerChat(ownerChat);
                        setOwnerChatMsg("Owner chat settings saved.");
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                    className="space-y-4"
                  >
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Your WhatsApp number</span>
                      <Input
                        className="tnum w-56"
                        value={ownerChat.phone}
                        onChange={(e) => setOwnerChat({ ...ownerChat, phone: e.target.value })}
                        placeholder="2547…"
                      />
                      <span className="mt-1 block text-xs text-muted">
                        Full international format. Used for owner chat and morning digest delivery.
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-700"
                        checked={ownerChat.enabled}
                        onChange={(e) => setOwnerChat({ ...ownerChat, enabled: e.target.checked })}
                      />
                      <span className="font-medium">Let me message my business from this number</span>
                    </label>
                    <p className="text-xs text-muted">
                      When on, messages from this number go to your private assistant instead of the customer
                      sales AI — so it never books you as a lead. Ask things like “leads today”, “who owes me”,
                      or “what’s on this week”.
                    </p>
                    <Button type="submit">Save owner chat</Button>
                  </form>
                )}
              </Section>

              <Section
                title="Morning digest"
                description="Your AI's daily report — what it handled yesterday and what still needs you today. Delivered every morning to WhatsApp (when your window is open) or email."
              >
                {digestMsg && <Notice>{digestMsg}</Notice>}
                {digest && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setDigestMsg(null);
                      setError(null);
                      try {
                        await api.saveDigest(digest);
                        setDigestMsg("Digest settings saved.");
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                    className="space-y-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-700"
                        checked={digest.enabled}
                        onChange={(e) => setDigest({ ...digest, enabled: e.target.checked })}
                      />
                      <span className="font-medium">Send me a morning digest</span>
                    </label>
                    <div className="flex flex-wrap gap-4">
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium">Send at (EAT)</span>
                        <Select
                          className="w-28"
                          value={String(digest.hour)}
                          onChange={(e) => setDigest({ ...digest, hour: Number(e.target.value) })}
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {String(h).padStart(2, "0")}:00
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium">Deliver by</span>
                        <Select
                          className="w-56"
                          value={digest.channel}
                          onChange={(e) =>
                            setDigest({ ...digest, channel: e.target.value as DigestSettings["channel"] })
                          }
                        >
                          <option value="auto">WhatsApp if possible, else email</option>
                          <option value="whatsapp">WhatsApp only</option>
                          <option value="email">Email only</option>
                        </Select>
                      </label>
                    </div>
                    {digest.channel !== "email" && (
                      <p className="text-xs text-muted">
                        {ownerChat?.phone
                          ? `Delivered to your WhatsApp number (${ownerChat.phone}), set under “Chat with your business” above. Falls back to email when your 24h window is closed and no digest template is approved.`
                          : "Set your WhatsApp number under “Chat with your business” above to receive this on WhatsApp. Until then it’s emailed to you."}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="submit">Save digest settings</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          setDigestMsg(null);
                          setError(null);
                          try {
                            const res = await api.previewDigest();
                            setDigestPreview(res.text);
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        Preview
                      </Button>
                      {tenant.role === "owner" && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={sendingTest}
                          onClick={async () => {
                            setDigestMsg(null);
                            setError(null);
                            setSendingTest(true);
                            try {
                              const res = await api.sendTestDigest();
                              setDigestMsg(`Test digest sent by ${res.channel}.`);
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setSendingTest(false);
                            }
                          }}
                        >
                          {sendingTest ? "Sending…" : "Send test now"}
                        </Button>
                      )}
                    </div>
                    {digestPreview && (
                      <div className="mt-2 whitespace-pre-wrap rounded-card border border-line bg-canvas px-4 py-3 text-sm text-ink">
                        {digestPreview}
                      </div>
                    )}
                  </form>
                )}
              </Section>
            </>
          )}

          {tab === "payments" && (
            <>
              <Section
                title="Payments (Paystack)"
                description="Connect your Paystack account and the AI can collect payment in chat — M-Pesa or card — when a customer agrees to buy."
              >
                {tenant.paystackConfigured && (
                  <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2 className="size-4" /> Connected — in-chat payments are on.
                  </p>
                )}
                {paystackMsg && <Notice className="mb-3">{paystackMsg}</Notice>}
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
                  <PasswordInput
                    wrapperClassName="flex-1"
                    value={paystackKey}
                    onChange={(e) => setPaystackKey(e.target.value)}
                    placeholder="Paystack secret key (sk_live_... or sk_test_...)"
                  />
                  <Button type="submit" variant="secondary" disabled={!paystackKey}>
                    {tenant.paystackConfigured ? "Update" : "Connect"}
                  </Button>
                </form>

                {tenant.paystackConfigured && (
                  <label className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-sm">
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      checked={tenant.paymentApproval}
                      onChange={async (e) => {
                        const payments = e.target.checked;
                        setError(null);
                        try {
                          await api.saveApprovals(payments);
                          setTenant({ ...tenant, paymentApproval: payments });
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium">Approve payment links before they’re sent</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        When on, the AI proposes a payment and you tap to send the link from the inbox —
                        money never goes out on a guess. Other captures stay automatic.
                      </span>
                    </span>
                  </label>
                )}
              </Section>

              <Section
                title="Invoice branding"
                description="Shown on the invoices your customers open. The logo and contact line appear at the top; payment instructions show on invoices issued without an online pay link."
              >
                {brandingMsg && <Notice className="mb-3">{brandingMsg}</Notice>}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBrandingMsg(null);
                    setError(null);
                    const next: InvoiceBranding = {
                      logoUrl: branding.logoUrl.trim() || null,
                      businessPhone: branding.businessPhone.trim() || null,
                      businessEmail: branding.businessEmail.trim() || null,
                      payInstructions: branding.payInstructions.trim() || null,
                    };
                    try {
                      await api.saveBranding(next);
                      setBrandingMsg("Saved.");
                      setTenant({ ...tenant, branding: next });
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="text-sm">
                    <span className="mb-1.5 block font-medium">Logo</span>
                    <div className="flex items-center gap-3">
                      {branding.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={branding.logoUrl}
                          alt="Logo"
                          className="size-12 rounded-card border border-line object-contain"
                        />
                      ) : (
                        <div className="grid size-12 place-items-center rounded-card border border-dashed border-line text-xs text-muted">
                          none
                        </div>
                      )}
                      <div className="flex flex-col items-start gap-1">
                        <label className="inline-flex cursor-pointer items-center rounded-card border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-canvas">
                          {uploadingLogo ? "Uploading…" : "Upload image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              setError(null);
                              setUploadingLogo(true);
                              try {
                                const { logoUrl } = await api.uploadLogo(f);
                                setBranding((b) => ({ ...b, logoUrl }));
                              } catch (err) {
                                setError((err as Error).message);
                              } finally {
                                setUploadingLogo(false);
                              }
                            }}
                          />
                        </label>
                        {branding.logoUrl && (
                          <button
                            type="button"
                            onClick={() => setBranding({ ...branding, logoUrl: "" })}
                            className="text-xs text-muted hover:text-danger"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <Input
                      className="mt-2"
                      value={branding.logoUrl.startsWith("data:") ? "" : branding.logoUrl}
                      onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                      placeholder="…or paste an image URL"
                    />
                    <p className="mt-1 text-xs text-muted">
                      PNG, JPG, WEBP or GIF, under 512KB. Uploads save immediately.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="block min-w-[12rem] flex-1 text-sm">
                      <span className="mb-1 block font-medium">Business phone</span>
                      <Input
                        value={branding.businessPhone}
                        onChange={(e) => setBranding({ ...branding, businessPhone: e.target.value })}
                        placeholder="+254…"
                      />
                    </label>
                    <label className="block min-w-[12rem] flex-1 text-sm">
                      <span className="mb-1 block font-medium">Business email</span>
                      <Input
                        value={branding.businessEmail}
                        onChange={(e) => setBranding({ ...branding, businessEmail: e.target.value })}
                        placeholder="hello@business.co.ke"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Payment instructions (offline)</span>
                    <Textarea
                      value={branding.payInstructions}
                      onChange={(e) => setBranding({ ...branding, payInstructions: e.target.value })}
                      rows={2}
                      placeholder="e.g. M-Pesa Till 123456, or pay on delivery."
                    />
                  </label>
                  <Button type="submit" variant="secondary">
                    Save branding
                  </Button>
                </form>
              </Section>
            </>
          )}

          {tab === "team" && (
            <Section title="Team & activity">
              <TeamManager isOwner={tenant.role === "owner"} />
            </Section>
          )}

          {tab === "account" && (
            <>
              <Section title="Account">
                <PasswordForm />
              </Section>

              <Section
                title="Data & compliance"
                description="Guardrails that protect your WhatsApp number and your customers' data."
              >
                {complianceMsg && <Notice className="mb-3">{complianceMsg}</Notice>}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setComplianceMsg(null);
                    setError(null);
                    try {
                      await api.saveCompliance({
                        dailyMessageCap: cap.trim() ? Number(cap) : null,
                        dataRetentionDays: retention.trim() ? Number(retention) : null,
                      });
                      setComplianceMsg("Saved.");
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="space-y-4"
                >
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Max messages per customer per day</span>
                    <Input
                      type="number"
                      className="tnum w-32"
                      value={cap}
                      onChange={(e) => setCap(e.target.value)}
                      placeholder="6 (default)"
                    />
                    <span className="mt-1 block text-xs text-muted">
                      Caps proactive nudges so you never spam a lead. Blank = platform default (6).
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Delete conversation history after (days)</span>
                    <Input
                      type="number"
                      className="tnum w-32"
                      value={retention}
                      onChange={(e) => setRetention(e.target.value)}
                      placeholder="Keep forever"
                    />
                    <span className="mt-1 block text-xs text-muted">
                      Blank = keep forever. Contacts and stats are always kept; only message text ages out.
                    </span>
                  </label>
                  <Button type="submit">Save compliance settings</Button>
                </form>
                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="mb-1 text-sm font-semibold">Export your data</h3>
                  <p className="mb-3 text-sm text-muted">
                    Download all contacts, conversations, appointments, and invoices as JSON (data
                    portability).
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => void api.exportData().catch((err) => setError((err as Error).message))}
                  >
                    Download export
                  </Button>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      {description ? (
        <p className="mb-4 mt-1 text-sm text-muted">{description}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </Card>
  );
}

function Notice({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`rounded-card bg-primary-soft px-3 py-2 text-sm text-primary-700 ${className}`}>
      {children}
    </p>
  );
}

function HealthPill({ health }: { health: TenantInfo["health"] }) {
  const rating = health.qualityRating ?? "UNKNOWN";
  const tone: BadgeTone =
    rating === "GREEN" ? "success" : rating === "YELLOW" ? "attention" : rating === "RED" ? "danger" : "neutral";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Badge tone={tone}>Quality: {rating === "UNKNOWN" ? "Checking…" : rating}</Badge>
      {health.messagingLimit && (
        <Badge tone="neutral">Limit: {health.messagingLimit.replace("TIER_", "")}</Badge>
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
      {msg && <Notice>{msg}</Notice>}
      {err && <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <PasswordInput
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
        />
        <PasswordInput
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (min 8 characters)"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={!current || next.length < 8}>
        Change password
      </Button>
    </form>
  );
}
