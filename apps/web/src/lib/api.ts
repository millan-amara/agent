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

export interface BookingSettings {
  enabled: boolean;
  slotMinutes: number;
  daysAhead: number;
  hours: Record<string, { start: string; end: string } | null>;
}

export interface BusinessProfile {
  description: string;
  services?: Array<{ name: string; price?: string }>;
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
  stages: string[];
  profile: BusinessProfile;
  followUps: FollowUpSettings;
  booking: BookingSettings;
  paystackConfigured: boolean;
  paymentApproval: boolean;
  health: WhatsAppHealth;
  compliance: ComplianceSettings;
  billing: BillingStatus;
  role: Role;
  googleConnected: boolean;
}

export interface Me {
  email: string;
  emailVerified: boolean;
  role: Role;
  locale: "en" | "sw";
  tenant: Omit<TenantInfo, "profile">;
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
  connectWhatsApp: (body: { phoneNumberId: string; accessToken: string; wabaId?: string }) =>
    request<{ ok: true; number: string; name: string }>("/api/tenant/whatsapp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  connectWhatsAppEmbedded: (body: { code: string; phoneNumberId: string; wabaId: string }) =>
    request<{ ok: true; number: string; name: string }>("/api/tenant/whatsapp/embedded", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveFollowUps: (body: FollowUpSettings) =>
    request<{ ok: true }>("/api/tenant/followups", { method: "PUT", body: JSON.stringify(body) }),
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
  approveInvoice: (contactId: string, invoiceId: string) =>
    request<{ ok: true; delivered: boolean; payUrl?: string }>(
      `/api/contacts/${contactId}/invoices/${invoiceId}/approve`,
      { method: "POST" },
    ),
};
