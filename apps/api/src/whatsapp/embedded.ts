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
