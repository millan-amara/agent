/**
 * Shared renderer for the OpenGraph / Twitter social card (1200×630). Both
 * app/opengraph-image.tsx and app/twitter-image.tsx delegate here so the card
 * stays identical. Uses next/og's default font, so no font files are needed.
 */
import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";
export const ogAlt = "Azayon — the AI front desk for WhatsApp-first businesses";

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b5d4a 0%, #063025 100%)",
          padding: 80,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>
          Azayon
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            Your WhatsApp, answered. Leads booked. Payments followed up.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.82)", maxWidth: 900 }}>
            The AI front desk for WhatsApp-first businesses.
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 24, color: "rgba(255,255,255,0.88)" }}>
          <span>14-day free trial</span>
          <span>·</span>
          <span>KES pricing</span>
          <span>·</span>
          <span>M-Pesa &amp; card</span>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
