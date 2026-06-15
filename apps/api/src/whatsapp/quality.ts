import type { Tenant } from "@prisma/client";
import { db } from "../db.js";
import { sendEmail } from "../email.js";
import { tenantToken } from "./sender.js";
import { fetchWithTimeout } from "../http.js";

/**
 * WhatsApp number health. Meta degrades a number's quality rating
 * (GREEN → YELLOW → RED) and lowers its messaging limit before restricting it.
 * We capture both from the quality webhook and a periodic Graph poll, store
 * them on the tenant, and alert the owner on any drop — throttling before Meta
 * does (PLAN §3, top risks).
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const POLL_INTERVAL_MS = 60 * 60 * 1000; // at most hourly per tenant
const RANK: Record<string, number> = { GREEN: 3, YELLOW: 2, RED: 1, UNKNOWN: 0 };

async function alertOwners(tenant: Tenant, rating: string): Promise<void> {
  const users = await db.user.findMany({ where: { tenantId: tenant.id } });
  const subject = `⚠ WhatsApp quality dropped to ${rating} — ${tenant.name}`;
  const body = `Your WhatsApp number's quality rating is now ${rating}. Meta lowers messaging limits and can restrict numbers at RED. Reduce proactive messages, avoid being reported, and keep replies helpful. Azayon has flagged this in your dashboard.`;
  await Promise.all(
    users.map((u) =>
      sendEmail({ to: u.email, subject, html: `<p>${body}</p>`, text: body }).catch((err) =>
        console.error("[quality] alert email failed:", err),
      ),
    ),
  );
}

/** Persist a new rating/limit; alert owners when the rating degrades. */
export async function recordQuality(
  tenant: Tenant,
  rating: string | null,
  messagingLimit: string | null,
): Promise<void> {
  const newRating = (rating ?? "UNKNOWN").toUpperCase();
  const prev = tenant.waQualityRating ?? "UNKNOWN";
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      waQualityRating: newRating,
      ...(messagingLimit ? { waMessagingLimit: messagingLimit } : {}),
      waQualityCheckedAt: new Date(),
    },
  });
  const degraded = (RANK[newRating] ?? 0) < (RANK[prev] ?? 0) && newRating !== "UNKNOWN";
  if (degraded && (newRating === "YELLOW" || newRating === "RED")) {
    await alertOwners(tenant, newRating);
  }
}

/** Polls connected tenants' quality + messaging tier from the Graph API. */
export async function pollQualityRatings(): Promise<void> {
  const tenants = await db.tenant.findMany({ where: { NOT: { waPhoneNumberId: null } } });
  for (const tenant of tenants) {
    if (
      tenant.waQualityCheckedAt &&
      Date.now() - tenant.waQualityCheckedAt.getTime() < POLL_INTERVAL_MS
    ) {
      continue;
    }
    const token = tenantToken(tenant);
    if (!token) continue;
    try {
      const res = await fetchWithTimeout(
        `${GRAPH}/${tenant.waPhoneNumberId}?fields=quality_rating,messaging_limit_tier`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        quality_rating?: string;
        messaging_limit_tier?: string;
      };
      await recordQuality(tenant, data.quality_rating ?? null, data.messaging_limit_tier ?? null);
    } catch (err) {
      console.error(`[quality] poll failed for ${tenant.id}:`, err);
    }
  }
}
