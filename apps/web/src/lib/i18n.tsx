"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Locale = "en" | "sw";

/**
 * Lightweight i18n. UI strings live in one dictionary keyed by a stable id with
 * en + sw values; `t(key)` resolves against the active locale and falls back to
 * English (then the key itself). The mechanism covers the whole app; high-traffic
 * surfaces are translated now, the rest stay English behind the same `t()` so
 * they're translation-ready. Preference persists per user (and in localStorage).
 */
const DICT: Record<string, { en: string; sw: string }> = {
  // nav
  "nav.home": { en: "Home", sw: "Mwanzo" },
  "nav.inbox": { en: "Inbox", sw: "Ujumbe" },
  "nav.pipeline": { en: "Pipeline", sw: "Hatua" },
  "nav.bookings": { en: "Bookings", sw: "Miadi" },
  "nav.invoices": { en: "Invoices", sw: "Ankara" },
  "nav.broadcasts": { en: "Broadcasts", sw: "Matangazo" },
  "nav.contacts": { en: "Contacts", sw: "Wateja" },
  "nav.simulator": { en: "Simulator", sw: "Jaribio" },
  "nav.billing": { en: "Billing", sw: "Malipo" },
  "nav.settings": { en: "Settings", sw: "Mipangilio" },
  "nav.logout": { en: "Log out", sw: "Toka" },
  // dashboard
  "dash.title": { en: "Last 30 days", sw: "Siku 30 zilizopita" },
  "dash.subtitle": {
    en: "What Azayon has been doing for your business.",
    sw: "Azayon imekuwa ikifanya nini kwa biashara yako.",
  },
  "dash.newLeads": { en: "New leads", sw: "Wateja wapya" },
  "dash.qualified": { en: "Qualified", sw: "Waliohakikiwa" },
  "dash.booked": { en: "Appointments booked", sw: "Miadi iliyowekwa" },
  "dash.followUps": { en: "Follow-ups sent", sw: "Ufuatiliaji uliotumwa" },
  "dash.recovered": { en: "Leads recovered", sw: "Wateja waliorejeshwa" },
  "dash.payments": { en: "Payments collected", sw: "Malipo yaliyokusanywa" },
  "dash.sources": { en: "Where your business comes from", sw: "Biashara yako inatoka wapi" },
  // common
  "common.save": { en: "Save", sw: "Hifadhi" },
  "common.send": { en: "Send", sw: "Tuma" },
  "common.connect": { en: "Connect", sw: "Unganisha" },
  "common.loading": { en: "Loading…", sw: "Inapakia…" },
};

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof typeof DICT | string) => string;
}

const Ctx = createContext<LocaleCtx>({ locale: "en", setLocale: () => {}, t: (k) => String(k) });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("azayon_locale")) as Locale | null;
    if (stored === "en" || stored === "sw") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("azayon_locale", l);
    api.setLocale(l).catch(() => {}); // best-effort server persist
  }, []);

  const t = useCallback(
    (key: string) => {
      const entry = DICT[key];
      if (!entry) return key;
      return entry[locale] ?? entry.en;
    },
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
