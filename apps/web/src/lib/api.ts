export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ApiMessage {
  id: string;
  direction: "in" | "out";
  author: "customer" | "ai" | "human" | "system";
  kind: "text" | "event";
  text: string;
  createdAt: string;
}

export interface ApiContact {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  source: string | null;
  fields: Record<string, unknown>;
  isSimulated?: boolean;
  aiPaused: boolean;
  optedOut: boolean;
  needsHuman: boolean;
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

export interface TenantInfo {
  id: string;
  name: string;
  vertical: string;
  onboarded: boolean;
  waConnected: boolean;
  stages: string[];
  profile: BusinessProfile;
}

export interface Me {
  email: string;
  tenant: Omit<TenantInfo, "profile">;
}

export interface VerticalTemplate {
  id: string;
  label: string;
  emoji: string;
  stages: string[];
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

export const api = {
  // auth
  signup: (body: { email: string; password: string; businessName: string; vertical: string }) =>
    request<{ ok: true }>("/api/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<Me>("/api/auth/me"),
  templates: () => request<VerticalTemplate[]>("/api/templates"),

  // tenant / onboarding
  tenant: () => request<TenantInfo>("/api/tenant"),
  saveProfile: (body: {
    profile: BusinessProfile;
    stages?: string[];
    name?: string;
    completeOnboarding?: boolean;
  }) => request<{ ok: true }>("/api/tenant/profile", { method: "PUT", body: JSON.stringify(body) }),
  connectWhatsApp: (body: { phoneNumberId: string; accessToken: string }) =>
    request<{ ok: true; number: string; name: string }>("/api/tenant/whatsapp", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
};
