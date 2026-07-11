import { config } from "../config.js";
import { fetchWithTimeout } from "../http.js";

/**
 * Meta Embedded Signup — one-click WhatsApp connection (replaces the manual
 * paste-three-IDs flow). The browser runs FB.login with our Tech Provider
 * config and returns a short-lived `code` plus the chosen phone_number_id /
 * waba_id; we exchange the code for a business token, subscribe our app to the
 * WABA so webhooks flow, and hand back the number details. Requires Meta Tech
 * Provider approval + META_APP_ID/SECRET/CONFIG_ID to actually run.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export class EmbeddedSignupError extends Error {}

export const embeddedSignupConfigured = Boolean(config.META_APP_ID && config.META_APP_SECRET);

/** Exchanges the embedded-signup code for a long-lived business access token. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  if (!config.META_APP_ID || !config.META_APP_SECRET) {
    throw new EmbeddedSignupError("Embedded Signup is not configured.");
  }
  const url =
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(config.META_APP_ID)}` +
    `&client_secret=${encodeURIComponent(config.META_APP_SECRET)}` +
    `&code=${encodeURIComponent(code)}`;
  const res = await fetchWithTimeout(url);
  const data = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !data.access_token) {
    throw new EmbeddedSignupError(data.error?.message ?? "Meta rejected the signup code.");
  }
  return data.access_token;
}

/** Subscribes our app to the tenant's WABA so inbound webhooks are delivered. */
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  const res = await fetchWithTimeout(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new EmbeddedSignupError(`Could not subscribe to the WhatsApp account: ${await res.text()}`);
  }
}

/**
 * The inverse: tells Meta to stop delivering this WABA's webhooks to our app.
 *
 * Without this, disconnecting leaves us subscribed forever — Meta keeps POSTing the
 * customer's messages, they match no tenant, and they're dropped into a black hole.
 * Worse, disconnect discards the access token, so this call is only possible BEFORE
 * the credentials are cleared.
 *
 * Best-effort by design: returns false rather than throwing. A connection made through
 * the manual form was never subscribed in the first place, and a revoked token can't
 * unsubscribe — neither should be able to trap someone in a half-connected state.
 */
export async function unsubscribeAppFromWaba(wabaId: string, token: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${GRAPH}/${wabaId}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[whatsapp] could not unsubscribe from WABA ${wabaId}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[whatsapp] unsubscribe from WABA ${wabaId} failed:`, err);
    return false;
  }
}

/**
 * Coexistence onboarding requires the provider to kick off two syncs once Embedded
 * Signup completes — the customer's contacts and their message history.
 *
 * This is not optional housekeeping. Meta: "you have 24 hours to synchronize their
 * contacts and messaging history, otherwise they must be offboarded and they must
 * complete the flow again." We weren't calling either, so every coexistence onboard
 * was on a 24-hour fuse.
 *
 * NOTE: we deliberately do NOT call /{phone-number-id}/register here. For coexistence
 * Meta says to "skip the phone number registration step, as the number is already
 * registered" — the number stays live on the WhatsApp Business app. Registering would
 * be wrong, and needs a two-step PIN we have no business asking for.
 *
 * Best-effort: a failure must not roll back a connection that otherwise succeeded.
 * The data itself arrives later over the `history` and `smb_app_state_sync` webhooks.
 */
export async function startCoexistenceSync(
  phoneNumberId: string,
  token: string,
  syncType: "smb_app_state_sync" | "history",
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${GRAPH}/${phoneNumberId}/smb_app_data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
    });
    if (!res.ok) {
      console.warn(`[whatsapp] ${syncType} sync failed for ${phoneNumberId}: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as { request_id?: string };
    return data.request_id ?? null;
  } catch (err) {
    console.warn(`[whatsapp] ${syncType} sync errored for ${phoneNumberId}:`, err);
    return null;
  }
}

/** Reads the display number + verified name for confirmation. */
export async function fetchNumberInfo(
  phoneNumberId: string,
  token: string,
): Promise<{ number: string; name: string }> {
  const res = await fetchWithTimeout(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new EmbeddedSignupError("Could not read the connected number's details.");
  }
  const info = (await res.json()) as { display_phone_number?: string; verified_name?: string };
  return { number: info.display_phone_number ?? "", name: info.verified_name ?? "" };
}
