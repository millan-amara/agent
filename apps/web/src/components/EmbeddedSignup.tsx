"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

/**
 * One-click WhatsApp connection via Meta Embedded Signup. Renders only when the
 * public Meta app id + config id are present (i.e. Tech Provider approval is in
 * place); otherwise the caller's manual paste form remains the path. The Meta
 * popup returns an auth `code`; the phone_number_id / waba_id arrive on a
 * window message event. We post all three to the backend to finish the connect.
 */
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export function EmbeddedSignup({ onConnected }: { onConnected: (label: string) => void }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    if (!APP_ID || !CONFIG_ID) return;

    // Capture phone_number_id / waba_id from the embedded-signup iframe.
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.data) {
          sessionInfo.current = {
            phoneNumberId: data.data.phone_number_id,
            wabaId: data.data.waba_id,
          };
        }
      } catch {
        /* not our message */
      }
    };
    window.addEventListener("message", onMessage);

    if (window.FB) {
      setReady(true);
    } else {
      window.fbAsyncInit = () => {
        window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
        setReady(true);
      };
      const s = document.createElement("script");
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!APP_ID || !CONFIG_ID) return null;

  const launch = () => {
    setError(null);
    setWarning(null);
    if (!window.FB) return;
    setBusy(true);
    window.FB.login(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        // FB.login rejects an async callback ("asyncfunction, not function"),
        // so the callback stays sync and the async work runs in an IIFE.
        void (async () => {
          const code = response?.authResponse?.code;
          const { phoneNumberId, wabaId } = sessionInfo.current;
          if (!code || !phoneNumberId || !wabaId) {
            setBusy(false);
            setError("Signup was cancelled or didn't return a number. Try again or use manual setup.");
            return;
          }
          try {
            const res = await api.connectWhatsAppEmbedded({ code, phoneNumberId, wabaId });
            // Meta gives 24h to sync contacts + history, or the customer has to be
            // offboarded and redo the whole flow. A silent failure here would look
            // like a healthy connection right up until it expired.
            if (!res.syncStarted) {
              setWarning(
                "Connected, but WhatsApp didn't accept the contacts/history sync. Reconnect within 24 hours, or Meta will require you to onboard again.",
              );
            }
            onConnected(`${res.name} (${res.number})`);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        })();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        // Coexistence flow: onboard a number already on the WhatsApp Business app
        // (keeps the app live alongside the Cloud API). The old "coexistence"
        // value is deprecated — Meta requires "whatsapp_business_app_onboarding".
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  };

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={launch} disabled={!ready || busy}>
        <MessageCircle className="size-4" />
        {busy ? "Connecting…" : "Connect WhatsApp in one click"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {warning && (
        <p className="rounded-card bg-attentionSoft px-3 py-2 text-xs text-attention">{warning}</p>
      )}
    </div>
  );
}
