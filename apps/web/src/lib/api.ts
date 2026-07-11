export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ApiMessage {
  id: string;
  direction: "in" | "out";
  author: "customer" | "ai" | "human" | "system";
  kind: "text" | "event";
  text: string;
  mediaType?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | null;
  createdAt: string;
}

export interface ApiContact {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  source: string | null;
  fields: Record<string, unknown>;
  assignedUserId?: string | null;
  isSimulated?: boolean;
  aiPaused: boolean;
  optedOut: boolean;
  needsHuman: boolean;
  needsReview: boolean;
  windowOpen: boolean;
  lastInboundAt: string | null;
  createdAt: string;
}

export interface Conversation extends ApiContact {
  lastMessage: ApiMessage | null;
}

export interface ContactDetail extends ApiContact {
  messages: ApiMessage[];
  followUps: Array<{ id: string; dueAt: string; note: string }>;
  appointments?: Array<{ id: string; startsAt: string; note: string }>;
  invoices?: Array<{
    id: string;
    amountKes: number;
    description: string;
    status: string;
    createdAt: string;
  }>;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  note: string;
  contact: { id: string; name: string | null; phone: string };
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitKes: number;
  lineKes: number;
}

// draft | pending_approval | pending | paid | failed | cancelled
export interface Invoice {
  id: string;
  number: number;
  ref: string; // e.g. INV-0042
  amountKes: number;
  taxRate: number; // percentage, e.g. 16
  taxKes: number; // materialized tax amount
  currency: string;
  description: string;
  notes: string | null;
  status: string;
  payUrl: string | null;
  publicUrl: string;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string };
  items: InvoiceItem[];
}

export interface NewInvoice {
  contactId: string;
  items: Array<{ description: string; quantity: number; unitKes: number }>;
  description?: string;
  notes?: string;
  dueDate?: string;
  taxRate?: number; // percentage, e.g. 16
  withPayLink?: boolean;
  send?: boolean;
}

export interface InvoiceBranding {
  logoUrl: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  payInstructions: string | null;
}

// Shape returned by the public (unauthenticated) hosted invoice endpoint.
export interface PublicInvoice {
  ref: string;
  business: string;
  logoUrl: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  payInstructions: string | null;
  customer: string;
  amountKes: number;
  taxRate: number; // percentage, e.g. 16
  taxKes: number; // materialized tax amount
  currency: string;
  description: string;
  notes: string | null;
  status: string;
  payUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  items: Array<{ description: string; quantity: number; unitKes: number; lineKes: number }>;
}

export interface BookingSettings {
  enabled: boolean;
  slotMinutes: number;
  daysAhead: number;
  hours: Record<string, { start: string; end: string } | null>;
}

export interface BusinessProfile {
  description: string;
  /** `amountKes` is derived server-side from `price`; it's absent when the price
   *  isn't a single unambiguous number, which is what stops the AI invoicing it. */
  services?: Array<{ name: string; price?: string; amountKes?: number }>;
  faqs?: Array<{ q: string; a: string }>;
  tone?: string;
  languages?: string;
  neverSay?: string[];
  bookingInfo?: string;
  businessHours?: string;
}

export interface FollowUpSettings {
  enabled: boolean;
  delaysHours: number[];
  templateId: string;
}

export type DigestChannel = "auto" | "whatsapp" | "email";

export interface DigestSettings {
  enabled: boolean;
  hour: number;
  channel: DigestChannel;
  ownerPhone: string;
}

export interface DigestData {
  covers: string;
  yesterday: {
    handled: number;
    newLeads: number;
    booked: number;
    followUpsSent: number;
    paidKes: number;
  };
  outstanding: {
    waitingForYou: number;
    pendingApprovals: number;
    overdueInvoices: { count: number; totalKes: number };
    coldLeads: number;
  };
}

export interface DigestPreview {
  config: DigestSettings;
  data: DigestData;
  text: string;
}

export interface OwnerChatSettings {
  enabled: boolean;
  phone: string;
}

export interface PublicPageSettings {
  enabled: boolean;
  slug: string;
  url: string;
  waConnected: boolean;
}

export interface PublicBusiness {
  name: string;
  vertical: string;
  description: string;
  services: Array<{ name: string; price?: string }>;
  faqs: Array<{ q: string; a: string }>;
  hours: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  waLink: string | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected" | string;
  rejectionReason: string | null;
  createdAt: string;
}

export interface WhatsAppHealth {
  qualityRating: string | null;
  messagingLimit: string | null;
}

export interface ComplianceSettings {
  dailyMessageCap: number | null;
  dataRetentionDays: number | null;
}

export type BillingState = "trial" | "active" | "over_limit" | "readonly";

export interface BillingStatus {
  state: BillingState;
  plan: string;
  planTier: "starter" | "growth" | "pro" | null;
  conversationCount: number;
  limit: number | null;
  trialEndsAt: string | null;
  planRenewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PlanOption {
  tier: "starter" | "growth" | "pro";
  name: string;
  priceKes: number;
  convLimit: number;
  available: boolean;
}

export type Role = "owner" | "agent";

export interface TenantInfo {
  id: string;
  name: string;
  vertical: string;
  onboarded: boolean;
  waConnected: boolean;
  wabaConfigured: boolean;
  /** Which account is connected — so a profile switch can actually be confirmed. */
  waNumber: string | null;
  waWabaId: string | null;
  stages: string[];
  profile: BusinessProfile;
  followUps: FollowUpSettings;
  digest: DigestSettings;
  ownerChat: OwnerChatSettings;
  publicPage: PublicPageSettings;
  booking: BookingSettings;
  paystackConfigured: boolean;
  paymentApproval: boolean;
  health: WhatsAppHealth;
  compliance: ComplianceSettings;
  billing: BillingStatus;
  role: Role;
  googleConnected: boolean;
  branding?: InvoiceBranding;
}

export interface Me {
  email: string;
  emailVerified: boolean;
  role: Role;
  locale: "en" | "sw";
  /** The subset /api/auth/me actually returns — not the full TenantInfo. */
  tenant: {
    id: string;
    name: string;
    vertical: string;
    onboarded: boolean;
    waConnected: boolean;
    stages: string[];
    billing: BillingStatus;
    /** Base64 data: URL, or null. Brands the app shell. */
    logoUrl: string | null;
  };
}

export interface VerticalTemplate {
  id: string;
  label: string;
  emoji: string;
  stages: string[];
}

export interface KbDoc {
  id: string;
  title: string;
  source: string;
  status: string;
  chunks: number;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
}

export interface BroadcastSegment {
  stage?: string;
  source?: string;
  all?: boolean;
}

export interface Broadcast {
  id: string;
  templateId: string;
  segment: string;
  status: "draft" | "sending" | "done" | "failed";
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
}

export class AuthError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) throw new AuthError("not authenticated");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface DashboardData {
  period: string;
  newLeads: number;
  qualified: number;
  booked: number;
  followUpsSent: number;
  recovered: number;
  paidKes: number;
  needsHuman: number;
  activeConversations: number;
  health: {
    waConnected: boolean;
    aiEnabled: boolean;
    qualityRating?: string | null;
    messagingLimit?: string | null;
  };
  billing: {
    plan: string;
    trialEndsAt: string | null;
    usageThisMonth: { llmCalls: number; inputTokens: number; outputTokens: number };
  };
}

export interface AttributionSource {
  source: string;
  leads: number;
  qualified: number;
  booked: number;
  paidKes: number;
}

export const api = {
  // auth
  signup: (body: { email: string; password: string; businessName: string; vertical: string }) =>
    request<{ ok: true }>("/api/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  changePassword: (body: { current: string; next: string }) =>
    request<{ ok: true }>("/api/auth/password", { method: "POST", body: JSON.stringify(body) }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (body: { token: string; password: string }) =>
    request<{ ok: true }>("/api/auth/reset", { method: "POST", body: JSON.stringify(body) }),
  verifyEmail: (token: string) =>
    request<{ ok: true }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    request<{ ok: true }>("/api/auth/resend-verification", { method: "POST" }),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  attribution: () => request<{ sources: AttributionSource[] }>("/api/attribution"),
  login: (body: { email: string; password: string }) =>
    request<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<Me>("/api/auth/me"),
  setLocale: (locale: string) =>
    request<{ ok: true }>("/api/auth/locale", { method: "PUT", body: JSON.stringify({ locale }) }),
  templates: () => request<VerticalTemplate[]>("/api/templates"),

  // tenant / onboarding
  tenant: () => request<TenantInfo>("/api/tenant"),
  saveProfile: (body: {
    profile: BusinessProfile;
    stages?: string[];
    name?: string;
    completeOnboarding?: boolean;
  }) => request<{ ok: true }>("/api/tenant/profile", { method: "PUT", body: JSON.stringify(body) }),
  draftProfile: (seed: string) =>
    request<{ description: string }>("/api/tenant/profile/draft", {
      method: "POST",
      body: JSON.stringify({ seed }),
    }),
  /** Clears the connection entirely. Also drops template approvals (they're per-WABA). */
  disconnectWhatsApp: () =>
    request<{ ok: true; templatesReset: number }>("/api/tenant/whatsapp", { method: "DELETE" }),
  connectWhatsApp: (body: { phoneNumberId: string; accessToken: string; wabaId?: string }) =>
    request<{ ok: true; number: string; name: string; templatesReset: number }>("/api/tenant/whatsapp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  connectWhatsAppEmbedded: (body: { code: string; phoneNumberId: string; wabaId: string }) =>
    request<{ ok: true; number: string; name: string; templatesReset: number }>("/api/tenant/whatsapp/embedded", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveFollowUps: (body: FollowUpSettings) =>
    request<{ ok: true }>("/api/tenant/followups", { method: "PUT", body: JSON.stringify(body) }),
  saveDigest: (body: DigestSettings) =>
    request<{ ok: true }>("/api/tenant/digest", { method: "PUT", body: JSON.stringify(body) }),
  previewDigest: () => request<DigestPreview>("/api/digest/preview"),
  sendTestDigest: () =>
    request<{ ok: true; channel: DigestChannel }>("/api/digest/test", { method: "POST" }),
  saveOwnerChat: (body: OwnerChatSettings) =>
    request<{ ok: true }>("/api/tenant/owner-chat", { method: "PUT", body: JSON.stringify(body) }),
  savePublicPage: (body: { enabled: boolean; slug: string }) =>
    request<{ ok: true; slug: string; url: string }>("/api/tenant/public", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  publicBusiness: (slug: string) =>
    request<PublicBusiness>(`/api/public/business/${encodeURIComponent(slug)}`),
  saveBooking: (body: BookingSettings) =>
    request<{ ok: true }>("/api/tenant/booking", { method: "PUT", body: JSON.stringify(body) }),
  savePaystack: (secretKey: string) =>
    request<{ ok: true }>("/api/tenant/paystack", {
      method: "PUT",
      body: JSON.stringify({ secretKey }),
    }),
  saveApprovals: (payments: boolean) =>
    request<{ ok: true }>("/api/tenant/approvals", {
      method: "PUT",
      body: JSON.stringify({ payments }),
    }),
  saveCompliance: (body: ComplianceSettings) =>
    request<{ ok: true }>("/api/tenant/compliance", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /**
   * Partial: only the keys you send are touched. Branding is split across two tabs
   * (Business owns name/logo/contact, Payments owns pay instructions), so sending a
   * whole object from one of them would blank the other's fields.
   */
  saveBranding: (body: Partial<InvoiceBranding> & { name?: string }) =>
    request<{ ok: true }>("/api/tenant/branding", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/tenant/logo`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Upload failed");
    }
    return res.json() as Promise<{ logoUrl: string }>;
  },
  deleteContact: (id: string) =>
    request<{ ok: true }>(`/api/contacts/${id}`, { method: "DELETE" }),
  exportData: async () => {
    const res = await fetch(`${API_URL}/api/tenant/export`, { credentials: "include" });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "azayon-export.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  appointments: () => request<Appointment[]>("/api/appointments"),
  googleAuthUrl: () => `${API_URL}/api/integrations/google/auth`,
  disconnectGoogle: () =>
    request<{ ok: true }>("/api/integrations/google", { method: "DELETE" }),
  cancelAppointment: (id: string) =>
    request<{ ok: true }>(`/api/appointments/${id}/cancel`, { method: "POST" }),

  // template messages
  messageTemplates: () => request<MessageTemplate[]>("/api/message-templates"),
  createTemplate: (body: { name: string; category: string; language: string; body: string }) =>
    request<MessageTemplate>("/api/message-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  submitTemplate: (id: string) =>
    request<MessageTemplate>(`/api/message-templates/${id}/submit`, { method: "POST" }),
  syncTemplates: () =>
    request<{ updated: number }>("/api/message-templates/sync", { method: "POST" }),
  deleteTemplate: (id: string) =>
    request<{ ok: true }>(`/api/message-templates/${id}`, { method: "DELETE" }),

  // billing
  billing: () =>
    request<{ status: BillingStatus; plans: PlanOption[]; checkoutEnabled: boolean }>("/api/billing"),
  subscribe: (tier: string) =>
    request<{ url: string }>("/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ tier }),
    }),
  cancelSubscription: () => request<{ ok: true }>("/api/billing/cancel", { method: "POST" }),
  resumeSubscription: () => request<{ ok: true }>("/api/billing/resume", { method: "POST" }),
  // dev-only billing override (no-op in prod)
  devSetBilling: (body: { plan?: string; planTier?: string | null; trialEndsAt?: string | null }) =>
    request<{ ok: true }>("/api/billing/_dev_set", { method: "POST", body: JSON.stringify(body) }),

  // team
  team: () => request<TeamMember[]>("/api/team"),
  inviteMember: (body: { email: string; role: string }) =>
    request<{ ok: true }>("/api/team/invite", { method: "POST", body: JSON.stringify(body) }),
  removeMember: (id: string) =>
    request<{ ok: true }>(`/api/team/${id}`, { method: "DELETE" }),
  auditLog: () => request<AuditEntry[]>("/api/audit"),
  assignContact: (id: string, userId: string | null) =>
    request<ApiContact>(`/api/contacts/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  // broadcasts
  broadcasts: () => request<Broadcast[]>("/api/broadcasts"),
  previewBroadcast: (segment: BroadcastSegment) =>
    request<{ count: number }>("/api/broadcasts/preview", {
      method: "POST",
      body: JSON.stringify({ segment }),
    }),
  createBroadcast: (body: { templateId: string; segment: BroadcastSegment }) =>
    request<Broadcast>("/api/broadcasts", { method: "POST", body: JSON.stringify(body) }),

  // knowledge base
  kbDocs: () => request<KbDoc[]>("/api/kb"),
  addKbText: (body: { title: string; content: string }) =>
    request<{ ok: true; chunks: number }>("/api/kb", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  uploadKb: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/kb/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Upload failed");
    }
    return res.json() as Promise<{ ok: true; chunks: number }>;
  },
  deleteKb: (id: string) => request<{ ok: true }>(`/api/kb/${id}`, { method: "DELETE" }),

  // simulator
  simulator: () => request<{ contact: ContactDetail | null }>("/api/simulator"),
  simulatorSend: (text: string) =>
    request<{ contactId: string }>("/api/simulator/messages", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  simulatorReset: () => request<{ ok: true }>("/api/simulator/reset", { method: "POST" }),

  // inbox / crm
  conversations: () => request<Conversation[]>("/api/conversations"),
  contact: (id: string) => request<ContactDetail>(`/api/contacts/${id}`),
  sendMessage: (id: string, text: string) =>
    request<{ message: ApiMessage; contact: ApiContact }>(`/api/contacts/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  setAi: (id: string, enabled: boolean) =>
    request<ApiContact>(`/api/contacts/${id}/ai`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  setStage: (id: string, stage: string) =>
    request<ApiContact>(`/api/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    }),
  /** Send an approved template — the only way to reach a contact past the 24h window. */
  sendTemplate: (contactId: string, templateId: string) =>
    request<{ message: ApiMessage; contact: ApiContact }>(`/api/contacts/${contactId}/template`, {
      method: "POST",
      body: JSON.stringify({ templateId }),
    }),
  /** Full replace of the lead's details map (a merge couldn't express a deletion). */
  setLeadFields: (id: string, fields: Record<string, string>) =>
    request<ApiContact>(`/api/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    }),
  /**
   * Save the pipeline. `renames` tells the server which rows were renamed so it can
   * carry leads across — by name alone it can't tell a rename from a delete+add.
   */
  saveStages: (stages: string[], renames: Array<{ from: string; to: string }> = []) =>
    request<{ ok: true; stages: string[] }>("/api/tenant/stages", {
      method: "PUT",
      body: JSON.stringify({ stages, renames }),
    }),
  approveInvoice: (contactId: string, invoiceId: string) =>
    request<{ ok: true; delivered: boolean; payUrl?: string }>(
      `/api/contacts/${contactId}/invoices/${invoiceId}/approve`,
      { method: "POST" },
    ),

  // invoices
  invoices: (status?: string) =>
    request<Invoice[]>(`/api/invoices${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  createInvoice: (body: NewInvoice) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  sendInvoice: (id: string) =>
    request<{ ok: true; delivered: boolean; publicUrl: string; invoice: Invoice }>(
      `/api/invoices/${id}/send`,
      { method: "POST" },
    ),
  cancelInvoice: (id: string) =>
    request<{ ok: true }>(`/api/invoices/${id}/cancel`, { method: "POST" }),
  publicInvoice: (token: string) => request<PublicInvoice>(`/api/public/invoices/${token}`),
};
