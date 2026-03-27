import OpenAI from "openai";
import { defaultAgents } from "@/data/agents";
import { sampleSession } from "@/data/sample-session";
import { importEvidenceFromUrl, mergeEvidence, searchEvidence } from "@/lib/evidence";
import { createMockDebateResponse } from "@/lib/mock-debate";
import { buildModeratorInstruction, buildSystemPrompt } from "@/lib/prompts";
import type { DebateMessage, DebateResponse, DebateSession, EvidenceCard } from "@/types/debate";

interface DebateRequestBody {
  topic?: string;
  userMessage?: string;
  history?: DebateMessage[];
  evidence?: EvidenceCard[];
  enableSearch?: boolean;
}

type LlmProvider = "openrouter" | "openai";

interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  models: string[];
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

interface TurnPlan {
  nextSpeakerId: string;
  moderatorInstruction: string;
  claimToAnswer: string;
  evidenceIds: string[];
  needsMoreEvidence: boolean;
}

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nextSpeakerId: {
      type: "string",
      enum: defaultAgents.filter((agent) => agent.role !== "user").map((agent) => agent.id)
    },
    moderatorInstruction: {
      type: "string"
    },
    claimToAnswer: {
      type: "string"
    },
    evidenceIds: {
      type: "array",
      items: {
        type: "string"
      }
    },
    needsMoreEvidence: {
      type: "boolean"
    }
  },
  required: ["nextSpeakerId", "moderatorInstruction", "claimToAnswer", "evidenceIds", "needsMoreEvidence"]
} as const;

function parseModelList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function getLlmConfig(): LlmConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      models: unique([
        process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        ...parseModelList(process.env.OPENROUTER_FALLBACK_MODELS),
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-haiku",
        "google/gemini-2.0-flash-001"
      ]),
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {})
      }
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      models: unique([process.env.OPENAI_MODEL || "gpt-4.1-mini", "gpt-4o-mini"])
    };
  }

  return null;
}

function getClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders
  });
}

function buildSession(body: DebateRequestBody | null): DebateSession {
  const history = body?.history ?? sampleSession.messages;
  const userMessage = body?.userMessage?.trim();
  const messages =
    userMessage && userMessage.length > 0
      ? [
          ...history,
          {
            id: `user-${history.length + 1}`,
            speakerId: "user",
            speaker: "You",
            role: "user" as const,
            turn: history.length + 1,
            content: userMessage
          }
        ]
      : history;

  return {
    ...sampleSession,
    topic: body?.topic ?? sampleSession.topic,
    messages,
    evidence: body?.evidence ?? sampleSession.evidence
  };
}

function buildEvidenceDigest(evidence: EvidenceCard[]): string {
  if (!evidence.length) {
    return "No evidence cards supplied yet.";
  }

  return evidence
    .map(
      (item) =>
        `- ${item.id} | ${item.title} | ${item.domain} | ${item.type} | credibility=${item.credibility} | status=${item.retrievalStatus} | ${item.excerpt} (${item.url})`
    )
    .join("\n");
}

function buildTranscript(session: DebateSession): string {
  return session.messages
    .map((message) => `Turn ${message.turn} | ${message.speaker} (${message.role}): ${message.content}`)
    .join("\n");
}

function buildAgentSummaries(session: DebateSession): string {
  return session.agents
    .filter((agent) => agent.role !== "user")
    .map((agent) => `${agent.id}: ${agent.name} | ${agent.lens} | ${agent.stance}`)
    .join("\n");
}

async function resolveEvidence(session: DebateSession, body: DebateRequestBody | null): Promise<{ mergedEvidence: EvidenceCard[]; liveEvidence: EvidenceCard[] }> {
  const importedFromMessage = await Promise.all(
    (body?.userMessage?.match(/https?:\/\/\S+/g) ?? []).map((url) => importEvidenceFromUrl(url.replace(/[),.;]+$/, "")))
  );

  let liveEvidence: EvidenceCard[] = [];
  if (body?.enableSearch && body?.userMessage?.trim()) {
    try {
      liveEvidence = await searchEvidence(body.userMessage, session.topic);
    } catch {
      liveEvidence = [];
    }
  }

  return {
    mergedEvidence: mergeEvidence(session.evidence, importedFromMessage, liveEvidence).slice(0, 8),
    liveEvidence
  };
}

async function planTurn(client: OpenAI, model: string, session: DebateSession): Promise<TurnPlan> {
  const moderatorInstructions = buildModeratorInstruction(session);

  const response = await client.responses.create({
    model,
    instructions: [
      "You plan the next turn in a multi-agent ethics debate.",
      moderatorInstructions,
      "Pick one next speaker, specify the exact claim from the latest turn they must answer, and choose only evidence ids that are already available.",
      "Prefer strong evidence cards with retrievalStatus ok or partial. Ignore failed evidence unless explicitly discussing the lack of evidence.",
      "If the evidence is weak, set needsMoreEvidence to true and make the moderator instruction request better sourcing.",
      "Use only the JSON schema requested in text.format."
    ].join("\n\n"),
    input: [
      `Topic: ${session.topic}`,
      `Framing: ${session.framing}`,
      "Available agents:",
      buildAgentSummaries(session),
      "Transcript:",
      buildTranscript(session),
      "Evidence available:",
      buildEvidenceDigest(session.evidence)
    ].join("\n\n"),
    text: {
      format: {
        type: "json_schema",
        name: "debate_turn_plan",
        schema: plannerSchema,
        strict: true
      }
    }
  });

  return JSON.parse(response.output_text) as TurnPlan;
}

async function generateSpeakerMessage(client: OpenAI, model: string, session: DebateSession, plan: TurnPlan): Promise<string> {
  const speaker = defaultAgents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
  const selectedEvidence = session.evidence.filter((item) => plan.evidenceIds.includes(item.id));

  const response = await client.responses.create({
    model,
    instructions: [
      buildSystemPrompt(speaker, session),
      `Moderator instruction: ${plan.moderatorInstruction}`,
      `Claim to answer: ${plan.claimToAnswer}`,
      plan.needsMoreEvidence
        ? "The evidence is incomplete. Be explicit about uncertainty and ask for better sourcing if needed."
        : "Use the best available evidence naturally without overstating confidence."
    ].join("\n\n"),
    input: [
      "Latest transcript:",
      buildTranscript(session),
      "Selected evidence cards:",
      buildEvidenceDigest(selectedEvidence),
      "Write the next speaker's reply now."
    ].join("\n\n")
  });

  return response.output_text.trim();
}

function shouldTryNextModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("not available in your region") || message.includes("rate limit") || message.includes("temporarily") || message.includes("overloaded") || message.includes("provider returned error") || message.includes("unsupported") || message.includes("timeout") || message.includes("503") || message.includes("429") || message.includes("403");
}

async function generateDebateResponse(session: DebateSession): Promise<DebateResponse & { provider?: string; model?: string; usedLiveModel?: boolean }> {
  const config = getLlmConfig();

  if (!config) {
    return {
      ...createMockDebateResponse(session),
      provider: "mock-fallback",
      model: "mock-fallback",
      usedLiveModel: false
    };
  }

  const client = getClient(config);
  const attemptedModels: string[] = [];
  let lastError: unknown = null;

  for (const model of config.models) {
    attemptedModels.push(model);

    try {
      const plan = await planTurn(client, model, session);
      const speaker = defaultAgents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
      const content = await generateSpeakerMessage(client, model, session, plan);

      return {
        nextSpeakerId: speaker.id,
        moderatorInstruction: plan.moderatorInstruction,
        draftMessage: {
          id: `draft-${session.messages.length + 1}`,
          speakerId: speaker.id,
          speaker: speaker.name,
          role: speaker.role,
          turn: session.messages.length + 1,
          content
        },
        suggestedEvidence: session.evidence,
        evidenceUsed: plan.evidenceIds,
        attemptedModels,
        provider: config.provider,
        model,
        usedLiveModel: true
      };
    } catch (error) {
      lastError = error;
      if (!shouldTryNextModel(error)) {
        break;
      }
    }
  }

  return {
    suggestedEvidence: session.evidence,
    evidenceUsed: [],
    error: lastError instanceof Error ? lastError.message : "All configured live models failed.",
    attemptedModels,
    provider: config.provider,
    model: attemptedModels[attemptedModels.length - 1] ?? "mock-fallback",
    usedLiveModel: false
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as DebateRequestBody | null;
  const session = buildSession(body);
  const { mergedEvidence, liveEvidence } = await resolveEvidence(session, body);
  const sessionWithEvidence = {
    ...session,
    evidence: mergedEvidence
  };

  const response = await generateDebateResponse(sessionWithEvidence);
  const hasDraft = Boolean(response.draftMessage);

  return Response.json({
    ...response,
    suggestedEvidence: mergedEvidence,
    provider: response.provider ?? "mock-fallback",
    model: response.model ?? "mock-fallback",
    usedLiveModel: hasDraft && response.usedLiveModel,
    usedLiveSearch: liveEvidence.length > 0
  });
}
