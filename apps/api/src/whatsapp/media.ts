import type { Tenant } from "@prisma/client";
import { tenantToken } from "./sender.js";
import { fetchWithTimeout } from "../http.js";

const MEDIA_TIMEOUT_MS = 30_000;
// Cap on media we will buffer into memory. WhatsApp's own limits sit below this
// (images ~5MB, audio ~16MB); the cap stops a hostile/oversized download from
// OOM-ing the queue worker. Enforced both pre-read (Content-Length) and
// post-read (actual bytes), since the header can be absent or untrustworthy.
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

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
  const declared = Number(fileRes.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) {
    throw new Error(`media too large (${declared} bytes > ${MAX_MEDIA_BYTES})`);
  }
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(`media too large (${bytes.byteLength} bytes > ${MAX_MEDIA_BYTES})`);
  }
  return { bytes, mimeType: meta.mime_type ?? "application/octet-stream" };
}
