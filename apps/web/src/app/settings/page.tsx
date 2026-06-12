"use client";

import { useEffect, useState } from "react";
import { api, type BusinessProfile, type TenantInfo } from "@/lib/api";
import { ProfileForm } from "@/components/ProfileForm";

export default function SettingsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  useEffect(() => {
    api.tenant().then(setTenant).catch(() => {});
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
      const res = await api.connectWhatsApp({ phoneNumberId, accessToken });
      setConnectMsg(`Connected: ${res.name} (${res.number})`);
      setTenant({ ...tenant, waConnected: true });
      setPhoneNumberId("");
      setAccessToken("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto h-full max-w-2xl space-y-6 overflow-y-auto p-4">
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
          </div>
          <button
            disabled={saving || !phoneNumberId || !accessToken}
            className="rounded-card border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
          >
            {tenant.waConnected ? "Update connection" : "Connect"}
          </button>
        </form>
      </section>

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
    </div>
  );
}
