import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { createHash } from "node:crypto";
import type { EvidenceCard, EvidenceCredibility, EvidenceSourceKind, EvidenceType } from "@/types/debate";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

const MAX_SUMMARY_CHARS = 280;
const MAX_EXCERPT_CHARS = 360;
const MAX_SEARCH_RESULTS = 5;
const BLOCKLIST_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "nav",
  "footer",
  "header .menu",
  ".menu",
  ".nav",
  ".sidebar",
  ".share",
  ".social",
  ".ads",
  ".advert",
  ".cookie",
  "[aria-label='breadcrumb']"
];

function cleanText(input: string): string {
  return input
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1).trim()}...` : input;
}

function normalizeUrl(raw: string): string {
  const normalized = new URL(raw.trim());
  normalized.hash = "";
  return normalized.toString();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function detectSourceType(url: string, title?: string): EvidenceType {
  const lower = `${url} ${title ?? ""}`.toLowerCase();

  if (lower.includes("arxiv") || lower.endsWith(".pdf") || lower.includes("doi") || lower.includes("journal")) {
    return "paper";
  }

  if (lower.includes("case study") || lower.includes("case-study")) {
    return "case-study";
  }

  if (lower.includes("youtube") || lower.includes("youtu.be")) {
    return "video";
  }

  if (lower.includes("image") || /\.(png|jpg|jpeg|webp)$/i.test(lower)) {
    return "image";
  }

  return "article";
}

function scoreDomain(domain: string): number {
  const lower = domain.toLowerCase();

  if (lower.endsWith(".edu") || lower.endsWith(".gov") || lower.includes("arxiv.org") || lower.includes("nature.com") || lower.includes("science.org")) {
    return 3;
  }

  if (lower.endsWith(".org") || lower.includes("who.int") || lower.includes("oecd.org") || lower.includes("brookings.edu") || lower.includes("icrc.org") || lower.includes("carnegieendowment.org")) {
    return 2;
  }

  return 1;
}

function scoreEvidenceCandidate(url: string, title?: string): number {
  const lower = `${url} ${title ?? ""}`.toLowerCase();
  let score = scoreDomain(extractDomain(url));

  if (lower.endsWith(".pdf") || lower.includes("arxiv") || lower.includes("doi")) {
    score += 4;
  }

  if (lower.includes("policy") || lower.includes("report") || lower.includes("research") || lower.includes("study")) {
    score += 2;
  }

  if (lower.includes("youtube") || lower.includes("reddit") || lower.includes("blog")) {
    score -= 2;
  }

  return score;
}

function credibilityFrom(url: string, retrievalStatus: EvidenceCard["retrievalStatus"]): EvidenceCredibility {
  const score = scoreEvidenceCandidate(url);

  if (retrievalStatus === "failed") {
    return "low";
  }

  if (score >= 5) {
    return "high";
  }

  if (score >= 2) {
    return "medium";
  }

  return "low";
}

function buildEvidenceId(url: string): string {
  return `evidence-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
}

async function fetchTextLike(url: string): Promise<{ contentType: string; buffer: Buffer }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "EthicsArenaBot/1.0 (+http://localhost:3000)",
      Accept: "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.5"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const arrayBuffer = await response.arrayBuffer();
  return {
    contentType,
    buffer: Buffer.from(arrayBuffer)
  };
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const text = await parser.getText({ first: 3, last: 3 });
    return cleanText(text.text);
  } finally {
    await parser.destroy();
  }
}

function extractArticleFromHtml(html: string, url: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;

  for (const selector of BLOCKLIST_SELECTORS) {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  }

  const reader = new Readability(document, {
    keepClasses: false,
    charThreshold: 140
  });
  const article = reader.parse();

  const title = cleanText(article?.title ?? document.title ?? url) || url;
  const excerptSource = article?.excerpt ?? article?.textContent ?? document.body?.textContent ?? "";
  const text = cleanText(excerptSource);

  return { title, text };
}

function buildCard(params: {
  title: string;
  url: string;
  type: EvidenceType;
  sourceKind: EvidenceSourceKind;
  summary: string;
  excerpt: string;
  retrievalStatus: EvidenceCard["retrievalStatus"];
  usedBy?: string;
}): EvidenceCard {
  const normalizedUrl = normalizeUrl(params.url);
  return {
    id: buildEvidenceId(normalizedUrl),
    title: truncate(params.title, 120),
    type: params.type,
    sourceKind: params.sourceKind,
    summary: truncate(params.summary || params.excerpt || params.title, MAX_SUMMARY_CHARS),
    excerpt: truncate(params.excerpt || params.summary || params.title, MAX_EXCERPT_CHARS),
    url: normalizedUrl,
    domain: extractDomain(normalizedUrl),
    credibility: credibilityFrom(normalizedUrl, params.retrievalStatus),
    retrievalStatus: params.retrievalStatus,
    usedBy: params.usedBy ?? "Grounding"
  };
}

export async function importEvidenceFromUrl(url: string, sourceKind: EvidenceSourceKind = "user-url"): Promise<EvidenceCard> {
  const normalizedUrl = normalizeUrl(url);
  const inferredType = detectSourceType(normalizedUrl);

  try {
    const { contentType, buffer } = await fetchTextLike(normalizedUrl);
    const isPdf = inferredType === "paper" || contentType.toLowerCase().includes("pdf");

    if (isPdf) {
      const text = await parsePdf(buffer);
      const excerpt = truncate(text, MAX_EXCERPT_CHARS);
      const retrievalStatus = excerpt.length > 120 ? "ok" : "partial";
      return buildCard({
        title: decodeURIComponent(normalizedUrl.split("/").pop() || "Remote PDF"),
        url: normalizedUrl,
        type: "paper",
        sourceKind: sourceKind === "search" ? "search" : "user-pdf",
        summary: excerpt || "A remote PDF was added but only limited text could be extracted.",
        excerpt,
        retrievalStatus
      });
    }

    const html = buffer.toString("utf8");
    const article = extractArticleFromHtml(html, normalizedUrl);
    const excerpt = truncate(article.text, MAX_EXCERPT_CHARS);
    const retrievalStatus = excerpt.length > 120 ? "ok" : "partial";

    return buildCard({
      title: article.title,
      url: normalizedUrl,
      type: detectSourceType(normalizedUrl, article.title),
      sourceKind,
      summary: excerpt || "A user-provided URL was added but the page text was limited.",
      excerpt,
      retrievalStatus
    });
  } catch (error) {
    return buildCard({
      title: normalizedUrl,
      url: normalizedUrl,
      type: inferredType,
      sourceKind: inferredType === "paper" ? "user-pdf" : sourceKind,
      summary: error instanceof Error ? error.message : "Failed to retrieve the source.",
      excerpt: "The source could not be retrieved cleanly, so this card is link-only evidence until re-import succeeds.",
      retrievalStatus: "failed"
    });
  }
}

export function mergeEvidence(...groups: EvidenceCard[][]): EvidenceCard[] {
  const merged = new Map<string, EvidenceCard>();

  for (const group of groups) {
    for (const item of group) {
      const key = (() => {
        try {
          return normalizeUrl(item.url);
        } catch {
          return item.url;
        }
      })();
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, item);
        continue;
      }

      const currentScore = scoreEvidenceCandidate(item.url, item.title) + (item.retrievalStatus === "ok" ? 3 : item.retrievalStatus === "partial" ? 1 : 0);
      const existingScore = scoreEvidenceCandidate(existing.url, existing.title) + (existing.retrievalStatus === "ok" ? 3 : existing.retrievalStatus === "partial" ? 1 : 0);

      if (currentScore > existingScore) {
        merged.set(key, {
          ...item,
          id: buildEvidenceId(key),
          usedBy: existing.usedBy === item.usedBy ? item.usedBy : `${existing.usedBy}, ${item.usedBy}`
        });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aScore = scoreEvidenceCandidate(a.url, a.title) + (a.retrievalStatus === "ok" ? 3 : a.retrievalStatus === "partial" ? 1 : 0);
    const bScore = scoreEvidenceCandidate(b.url, b.title) + (b.retrievalStatus === "ok" ? 3 : b.retrievalStatus === "partial" ? 1 : 0);
    return bScore - aScore;
  });
}

export async function searchEvidence(query: string, topic?: string): Promise<EvidenceCard[]> {
  if (!process.env.SEARCH_API_KEY) {
    return [];
  }

  const compositeQuery = [query.trim(), topic?.trim(), "ethics debate evidence"].filter(Boolean).join(" ");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SEARCH_API_KEY}`
    },
    body: JSON.stringify({
      query: compositeQuery,
      topic: "general",
      search_depth: "advanced",
      max_results: MAX_SEARCH_RESULTS,
      include_answer: false,
      include_images: false,
      include_raw_content: false
    })
  });

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { results?: TavilyResult[] };
  const ranked = (payload.results ?? [])
    .filter((item): item is Required<Pick<TavilyResult, "url">> & TavilyResult => Boolean(item.url))
    .sort((a, b) => scoreEvidenceCandidate(b.url ?? "", b.title) - scoreEvidenceCandidate(a.url ?? "", a.title))
    .slice(0, MAX_SEARCH_RESULTS);

  const imported = await Promise.all(
    ranked.map(async (item) => {
      const card = await importEvidenceFromUrl(item.url ?? "", "search");
      const improvedTitle = card.title === card.url && item.title ? item.title : card.title;
      const improvedSummary =
        (card.retrievalStatus !== "ok" || card.summary.length < 80) && item.content
          ? truncate(cleanText(item.content), MAX_SUMMARY_CHARS)
          : card.summary;

      return {
        ...card,
        id: buildEvidenceId(card.url),
        title: improvedTitle,
        summary: improvedSummary,
        excerpt: card.retrievalStatus === "failed" && item.content ? truncate(cleanText(item.content), MAX_EXCERPT_CHARS) : card.excerpt,
        retrievalStatus: card.retrievalStatus === "failed" && item.content ? "partial" : card.retrievalStatus
      };
    })
  );

  return mergeEvidence(imported).slice(0, MAX_SEARCH_RESULTS);
}
