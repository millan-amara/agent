import type { Tenant } from "@prisma/client";
import { tenantToken } from "./sender.js";
import { fetchWithTimeout } from "../http.js";

const MEDIA_TIMEOUT_MS = 30_000;

const GRAPH = "https://graph.facebook.com/v21.0";

export interface DownloadedMedia {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Resolves a Meta media id to its bytes. Media ids are exchanged for a
 * short-lived, auth-gated URL, which is then fetched with the same token.
 */
export async function downloadMedia(tenant: Tenant, mediaId: string): Promise<DownloadedMedia> {
  const token = tenantToken(tenant);
  if (!token) throw new Error("No WhatsApp access token to download media");

  const metaRes = await fetchWithTimeout(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, MEDIA_TIMEOUT_MS);
  if (!metaRes.ok) {
    throw new Error(`media lookup failed (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("media lookup returned no url");

  const fileRes = await fetchWithTimeout(meta.url, { headers: { Authorization: `Bearer ${token}` } }, MEDIA_TIMEOUT_MS);
  if (!fileRes.ok) {
    throw new Error(`media download failed (${fileRes.status})`);
  }
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  return { bytes, mimeType: meta.mime_type ?? "application/octet-stream" };
}
