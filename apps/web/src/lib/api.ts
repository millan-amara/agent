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

export interface TenantInfo {
  id: string;
  name: string;
  stages: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  tenant: () => request<TenantInfo>("/api/tenant"),
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
