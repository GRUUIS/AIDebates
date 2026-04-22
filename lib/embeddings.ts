import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { DebateMessage, EvidenceCard } from "@/types/debate";
import { createEmbedding, getLlmConfig } from "@/lib/llm";

interface EmbeddingRecord {
  id: string;
  text: string;
  vector: number[];
  updatedAt: string;
}

interface EmbeddingIndex {
  evidence: Record<string, EmbeddingRecord>;
  claims: Record<string, EmbeddingRecord>;
}

const INDEX_PATH = join(process.cwd(), "data", "runtime", "embedding-index.json");
const ZERO_VECTOR: number[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function ensureIndexFile(): Promise<void> {
  await mkdir(dirname(INDEX_PATH), { recursive: true });
  try {
    await readFile(INDEX_PATH, "utf8");
  } catch {
    const empty: EmbeddingIndex = { evidence: {}, claims: {} };
    await writeFile(INDEX_PATH, JSON.stringify(empty, null, 2), "utf8");
  }
}

async function readIndex(): Promise<EmbeddingIndex> {
  await ensureIndexFile();
  try {
    return JSON.parse(await readFile(INDEX_PATH, "utf8")) as EmbeddingIndex;
  } catch {
    return { evidence: {}, claims: {} };
  }
}

async function writeIndex(index: EmbeddingIndex): Promise<void> {
  await ensureIndexFile();
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function buildClaimId(text: string): string {
  return `claim-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

export async function embedText(input: string): Promise<number[]> {
  const text = normalizeText(input);
  if (!text) {
    return ZERO_VECTOR;
  }

  const config = getLlmConfig();
  if (!config) {
    return ZERO_VECTOR;
  }

  try {
    const embedding = await createEmbedding(text);
    return embedding.length ? embedding : ZERO_VECTOR;
  } catch {
    return ZERO_VECTOR;
  }
}

export async function indexEvidenceCard(card: EvidenceCard): Promise<void> {
  const sourceText = normalizeText([
    card.title,
    card.summary,
    card.excerpt,
    ...(card.claims ?? []),
    card.ocrText ?? ""
  ].join(" "));

  if (!sourceText) {
    return;
  }

  const vector = await embedText(sourceText);
  if (!vector.length) {
    return;
  }

  const index = await readIndex();
  index.evidence[card.id] = {
    id: card.id,
    text: sourceText,
    vector,
    updatedAt: nowIso()
  };
  await writeIndex(index);
}

export async function indexClaimText(input: string): Promise<string | null> {
  const text = normalizeText(input);
  if (!text) {
    return null;
  }

  const vector = await embedText(text);
  if (!vector.length) {
    return null;
  }

  const id = buildClaimId(text);
  const index = await readIndex();
  index.claims[id] = {
    id,
    text,
    vector,
    updatedAt: nowIso()
  };
  await writeIndex(index);
  return id;
}

async function rankEvidenceByQuery(queryText: string, evidence: EvidenceCard[], excludeIds: string[] = []): Promise<EvidenceCard[]> {
  const queryVector = await embedText(queryText);
  if (!queryVector.length) {
    return evidence.filter((item) => !excludeIds.includes(item.id));
  }

  const index = await readIndex();
  return evidence
    .filter((item) => !excludeIds.includes(item.id))
    .map((item) => ({
      item,
      score: cosineSimilarity(queryVector, index.evidence[item.id]?.vector ?? ZERO_VECTOR)
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

export async function findRelevantEvidence(queryText: string, evidence: EvidenceCard[], limit = 4, excludeIds: string[] = []): Promise<EvidenceCard[]> {
  const ranked = await rankEvidenceByQuery(queryText, evidence, excludeIds);
  return ranked.slice(0, limit);
}

export async function findOpposingEvidence(queryText: string, evidence: EvidenceCard[], limit = 3, excludeIds: string[] = []): Promise<EvidenceCard[]> {
  const ranked = await rankEvidenceByQuery(queryText, evidence, excludeIds);
  return ranked
    .filter((item) => item.credibility !== "low")
    .sort((left, right) => {
      const cueWeight = /(however|but|critic|risk|harm|bias|limit|uncertain)/i.test(`${right.summary} ${right.excerpt}`) ? 1 : 0;
      const leftCueWeight = /(however|but|critic|risk|harm|bias|limit|uncertain)/i.test(`${left.summary} ${left.excerpt}`) ? 1 : 0;
      return cueWeight - leftCueWeight;
    })
    .slice(0, limit);
}

export async function findSimilarClaims(queryText: string, messages: DebateMessage[], limit = 3, excludeMessageId?: string): Promise<DebateMessage[]> {
  const queryVector = await embedText(queryText);
  if (!queryVector.length) {
    return messages.filter((message) => message.id !== excludeMessageId).slice(-limit);
  }

  const pairs = await Promise.all(
    messages
      .filter((message) => message.id !== excludeMessageId && message.role !== "user")
      .map(async (message) => ({
        message,
        vector: await embedText(message.content)
      }))
  );

  return pairs
    .map((entry) => ({
      message: entry.message,
      score: cosineSimilarity(queryVector, entry.vector)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.message);
}

export async function dedupeEvidence(cards: EvidenceCard[], threshold = 0.965): Promise<EvidenceCard[]> {
  const index = await readIndex();
  const kept: EvidenceCard[] = [];

  for (const card of cards) {
    const vector = index.evidence[card.id]?.vector;
    if (!vector?.length) {
      kept.push(card);
      continue;
    }

    const isDuplicate = kept.some((existing) => {
      const existingVector = index.evidence[existing.id]?.vector;
      return existingVector?.length ? cosineSimilarity(vector, existingVector) >= threshold : false;
    });

    if (!isDuplicate) {
      kept.push(card);
    }
  }

  return kept;
}

