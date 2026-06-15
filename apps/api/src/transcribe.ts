import { config } from "./config.js";
import { fetchWithTimeout } from "./http.js";

/**
 * Voice-note transcription via Groq's whisper-large-v3 (OpenAI-compatible
 * endpoint). Cheap, fast, and handles Kenyan English/Swahili/Sheng. Returns
 * null when no key is configured so callers can degrade gracefully.
 */
const GROQ_TRANSCRIBE = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(bytes: Buffer, mimeType: string): Promise<string | null> {
  if (!config.GROQ_API_KEY) return null;

  const ext = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mpeg") || mimeType.includes("mp3")
      ? "mp3"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("m4a") || mimeType.includes("mp4")
          ? "m4a"
          : "ogg";

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  // Bias toward the Kenyan language mix without hard-locking a single language.
  form.append("prompt", "WhatsApp voice note from a Kenyan customer (English/Swahili).");

  const res = await fetchWithTimeout(GROQ_TRANSCRIBE, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
    body: form,
  }, 30_000);
  if (!res.ok) {
    throw new Error(`Groq transcription failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? null;
}
