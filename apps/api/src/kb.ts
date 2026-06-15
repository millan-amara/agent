import { config } from "./config.js";
import { db } from "./db.js";
import { fetchWithTimeout } from "./http.js";

/**
 * Knowledge base (RAG). Tenants upload docs/FAQs; we chunk and embed them with
 * Voyage, then the agent retrieves the most relevant chunks at answer time via
 * the `search_knowledge_base` tool. Retrieval is brute-force cosine in JS —
 * pilot KBs are small (a handful of docs), so this is fast and works on both
 * SQLite (dev) and Postgres (prod) without pgvector.
 */
const VOYAGE_EMBED = "https://api.voyageai.com/v1/embeddings";
const EMBED_MODEL = "voyage-3-lite";
const CHUNK_CHARS = 1500; // ~400 tokens
const CHUNK_OVERLAP = 200;
const TOP_K = 4;

export class KbError extends Error {}

/** Splits text into overlapping chunks on paragraph/sentence boundaries. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      // Prefer to break on a paragraph or sentence boundary near the limit.
      const slice = clean.slice(start, end);
      const para = slice.lastIndexOf("\n\n");
      const sentence = slice.lastIndexOf(". ");
      const cut = para > CHUNK_CHARS * 0.5 ? para : sentence > CHUNK_CHARS * 0.5 ? sentence + 1 : -1;
      if (cut > 0) end = start + cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
    if (end >= clean.length) break;
  }
  return chunks;
}

/** Embeds texts with Voyage. Throws KbError when no key is configured. */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  if (!config.VOYAGE_API_KEY) {
    throw new KbError("Knowledge base needs VOYAGE_API_KEY to be configured.");
  }
  if (texts.length === 0) return [];
  const res = await fetchWithTimeout(VOYAGE_EMBED, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: EMBED_MODEL, input_type: inputType }),
  });
  if (!res.ok) {
    throw new KbError(`Voyage embedding failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  return (data.data ?? []).map((d) => d.embedding);
}

/** Ingests a document: chunk → embed → persist. Returns the created doc id. */
export async function ingestDoc(
  tenantId: string,
  title: string,
  content: string,
  source: "paste" | "upload",
): Promise<{ docId: string; chunkCount: number }> {
  const chunks = chunkText(content);
  if (chunks.length === 0) throw new KbError("The document is empty.");
  const embeddings = await embedTexts(chunks, "document");

  const doc = await db.kbDoc.create({ data: { tenantId, title, source, status: "ready" } });
  await db.kbChunk.createMany({
    data: chunks.map((content, i) => ({
      tenantId,
      docId: doc.id,
      ordinal: i,
      content,
      embedding: JSON.stringify(embeddings[i] ?? []),
    })),
  });
  return { docId: doc.id, chunkCount: chunks.length };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Returns the most relevant chunk texts for a query, or [] if KB is empty. */
export async function searchKb(tenantId: string, query: string): Promise<string[]> {
  const rows = await db.kbChunk.findMany({ where: { tenantId } });
  if (rows.length === 0) return [];
  const [queryEmbedding] = await embedTexts([query], "query");
  if (!queryEmbedding) return [];
  return rows
    .map((r) => ({ content: r.content, score: cosine(queryEmbedding, JSON.parse(r.embedding) as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((r) => r.content);
}

/** True when the tenant has any indexed chunks (gates the search tool). */
export async function hasKnowledgeBase(tenantId: string): Promise<boolean> {
  const count = await db.kbChunk.count({ where: { tenantId } });
  return count > 0;
}
