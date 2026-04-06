import OpenAI from "openai";
import { defaultAgents } from "@/data/agents";
import { importEvidenceFromUrl, mergeEvidence, searchEvidence } from "@/lib/evidence";
import { createMockDebateResponse } from "@/lib/mock-debate";
import { buildModeratorInstruction, buildSystemPrompt } from "@/lib/prompts";
import type {
  DebateActionRequest,
  DebateMessage,
  DebateResponse,
  DebateSession,
  EvidenceCard,
  JudgeReport,
  JuryRound,
  JurorResult,
  PostmortemReport,
  PostmortemScorecard
} from "@/types/debate";

const JURY_MODELS = ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "google/gemini-2.0-flash-001"];

type StreamEvent =
  | { type: "status"; status: string }
  | { type: "evidence"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean }
  | { type: "message_start"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string }
  | { type: "message_delta"; delta: string }
  | { type: "message_done"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string; attemptedModels?: string[] }
  | { type: "analysis_start"; analysisType: "jury" | "judge" | "postmortem"; status: string }
  | { type: "analysis_result"; analysisType: "jury" | "judge" | "postmortem"; result: JuryRound | JudgeReport | PostmortemReport }
  | { type: "session_meta"; title: string; mode: DebateSession["mode"]; updatedAt: string }
  | { type: "mode_state"; modeState: DebateSession["modeState"] }
  | { type: "done"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean; attemptedModels?: string[] }
  | { type: "error"; error: string; attemptedModels?: string[]; suggestedEvidence: EvidenceCard[]; provider?: string; model?: string };

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
      items: { type: "string" }
    },
    needsMoreEvidence: {
      type: "boolean"
    }
  },
  required: ["nextSpeakerId", "moderatorInstruction", "claimToAnswer", "evidenceIds", "needsMoreEvidence"]
} as const;

const jurySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    winner: { type: "string" },
    reasoning: { type: "string" },
    confidence: { type: "number" }
  },
  required: ["winner", "reasoning", "confidence"]
} as const;

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    factCheckSummary: { type: "string" },
    strongestSupportedClaim: { type: "string" },
    weakestSupportedClaim: { type: "string" },
    missingEvidence: { type: "string" },
    provisionalVerdict: { type: "string" }
  },
  required: ["factCheckSummary", "strongestSupportedClaim", "weakestSupportedClaim", "missingEvidence", "provisionalVerdict"]
} as const;

const postmortemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    bestArgumentByAgent: { type: "string" },
    unsupportedClaims: { type: "string" },
    missedQuestions: { type: "string" },
    nextPrompts: { type: "string" },
    scorecard: {
      type: "object",
      additionalProperties: false,
      properties: {
        coherence: { type: "number" },
        evidenceUse: { type: "number" },
        responsiveness: { type: "number" },
        fairness: { type: "number" },
        originality: { type: "number" }
      },
      required: ["coherence", "evidenceUse", "responsiveness", "fairness", "originality"]
    }
  },
  required: ["summary", "bestArgumentByAgent", "unsupportedClaims", "missedQuestions", "nextPrompts", "scorecard"]
} as const;

function parseModelList(value?: string): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function splitForStreaming(content: string): string[] {
  return Array.from(content);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStreamingDelay(character: string): number {
  if (character === "\n") {
    return 18;
  }

  if (/[，。！？；：,.!?;:]/.test(character)) {
    return 34;
  }

  return 16;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
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

function appendUserMessage(session: DebateSession, userMessage?: string): DebateSession {
  const trimmed = userMessage?.trim();
  if (!trimmed) {
    return session;
  }

  return {
    ...session,
    messages: [
      ...session.messages,
      {
        id: `user-${session.messages.length + 1}`,
        speakerId: "user",
        speaker: "You",
        role: "user",
        turn: session.messages.length + 1,
        content: trimmed
      }
    ]
  };
}

function buildEvidenceDigest(evidence: EvidenceCard[]): string {
  if (!evidence.length) {
    return "No evidence cards supplied yet.";
  }

  return evidence
    .map((item) => `- ${item.id} | ${item.title} | ${item.domain} | ${item.type} | credibility=${item.credibility} | status=${item.retrievalStatus} | ${item.excerpt} (${item.url})`)
    .join("\n");
}

function buildTranscript(session: DebateSession): string {
  return session.messages.map((message) => `Turn ${message.turn} | ${message.speaker} (${message.role}): ${message.content}`).join("\n");
}

function buildAgentSummaries(session: DebateSession): string {
  return session.agents.filter((agent) => agent.role !== "user").map((agent) => `${agent.id}: ${agent.name} | ${agent.lens} | ${agent.stance}`).join("\n");
}

function countAiTurns(session: DebateSession): number {
  return session.messages.filter((message) => message.role !== "user").length;
}

function shouldActivateStanceShift(session: DebateSession): boolean {
  return session.mode === "stance_shift" && !session.modeState.stanceShiftApplied && countAiTurns(session) >= 4;
}

async function resolveEvidence(session: DebateSession, userMessage?: string): Promise<{ mergedEvidence: EvidenceCard[]; liveEvidence: EvidenceCard[] }> {
  const importedFromMessage = await Promise.all((userMessage?.match(/https?:\/\/\S+/g) ?? []).map((url) => importEvidenceFromUrl(url.replace(/[),.;]+$/, ""))));

  let liveEvidence: EvidenceCard[] = [];
  if (session.settings.enableSearch && userMessage?.trim()) {
    try {
      liveEvidence = await searchEvidence(userMessage, session.topic);
    } catch {
      liveEvidence = [];
    }
  }

  const maxEvidence = session.settings.maxActiveEvidence ?? 8;
  return {
    mergedEvidence: mergeEvidence(session.evidence, importedFromMessage, liveEvidence).slice(0, maxEvidence),
    liveEvidence
  };
}

async function planTurn(client: OpenAI, model: string, session: DebateSession): Promise<TurnPlan> {
  const moderatorInstructions = buildModeratorInstruction(session);
  const stanceShiftDirective = shouldActivateStanceShift(session)
    ? `Stance shift is active. Prefer choosing one of these debaters next: ${(session.modeState.switchedAgentIds ?? ["utilitarian", "deontologist"]).join(", ")}.`
    : "";

  const response = await client.responses.create({
    model,
    instructions: [
      "You plan the next turn in a multi-agent ethics debate.",
      moderatorInstructions,
      stanceShiftDirective,
      "Pick one next speaker, specify the exact claim from the latest turn they must answer, and choose only evidence ids that are already available.",
      "Prefer strong evidence cards with retrievalStatus ok or partial. Ignore failed evidence unless explicitly discussing the lack of evidence.",
      "If the evidence is weak, set needsMoreEvidence to true and make the moderator instruction request better sourcing.",
      "Use only the JSON schema requested in text.format."
    ].filter(Boolean).join("\n\n"),
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
  const speaker = session.agents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
  const selectedEvidence = session.evidence.filter((item) => plan.evidenceIds.includes(item.id));
  const stanceShiftActive = shouldActivateStanceShift(session) && (session.modeState.switchedAgentIds ?? []).includes(speaker.id);

  const response = await client.responses.create({
    model,
    instructions: [
      buildSystemPrompt(speaker, session),
      `Moderator instruction: ${plan.moderatorInstruction}`,
      `Claim to answer: ${plan.claimToAnswer}`,
      plan.needsMoreEvidence ? "The evidence is incomplete. Be explicit about uncertainty and ask for better sourcing if needed." : "Use the best available evidence naturally without overstating confidence.",
      stanceShiftActive
        ? "Stance shift is active. Steelman the opposing side as strongly as possible while keeping the same moral lens. This is temporary and should read as an intentional reversal, not a permanent character rewrite."
        : ""
    ].filter(Boolean).join("\n\n"),
    input: ["Latest transcript:", buildTranscript(session), "Selected evidence cards:", buildEvidenceDigest(selectedEvidence), "Write the next speaker's reply now."].join("\n\n")
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
      const speaker = session.agents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
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

async function runJury(client: OpenAI, session: DebateSession): Promise<JuryRound> {
  const jurors = await Promise.all(
    JURY_MODELS.map(async (model) => {
      try {
        const response = await client.responses.create({
          model,
          instructions: [
            "You are a juror evaluating an AI debate.",
            "Choose the current winner, explain why, and provide a 0-100 confidence score.",
            "Use only the supplied transcript and evidence digest.",
            "Return only JSON matching the schema."
          ].join("\n\n"),
          input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(session.evidence)].join("\n\n"),
          text: {
            format: {
              type: "json_schema",
              name: "jury_vote",
              schema: jurySchema,
              strict: true
            }
          }
        });

        const parsed = JSON.parse(response.output_text) as Omit<JurorResult, "jurorModel">;
        return { jurorModel: model, ...parsed } satisfies JurorResult;
      } catch {
        return {
          jurorModel: model,
          winner: "Inconclusive",
          reasoning: "This juror could not return a reliable assessment.",
          confidence: 0
        } satisfies JurorResult;
      }
    })
  );

  const frequency = new Map<string, number>();
  for (const juror of jurors) {
    frequency.set(juror.winner, (frequency.get(juror.winner) ?? 0) + 1);
  }
  const consensusWinner = [...frequency.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Inconclusive";

  return {
    id: createId("jury"),
    createdAt: nowIso(),
    consensusWinner,
    consensusSummary: `The jury currently leans toward ${consensusWinner} based on argument quality, responsiveness, and evidence use.`,
    jurors
  };
}

async function runJudge(client: OpenAI, session: DebateSession): Promise<{ report: JudgeReport; suggestedEvidence: EvidenceCard[] }> {
  const judgeQuery = `${session.topic} ${session.messages.slice(-3).map((message) => message.content).join(" ")}`;
  const judgeEvidence = await searchEvidence(judgeQuery, session.topic).catch(() => [] as EvidenceCard[]);
  const evidence = mergeEvidence(session.evidence, judgeEvidence).slice(0, session.settings.maxActiveEvidence ?? 8);

  const response = await client.responses.create({
    model: getLlmConfig()?.models[0] ?? "gpt-4o-mini",
    instructions: [
      "You are a networked judge for an AI ethics debate.",
      "Summarize what is supported, what is weakly supported, and what evidence is still missing.",
      "Return only JSON matching the schema."
    ].join("\n\n"),
    input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(evidence)].join("\n\n"),
    text: {
      format: {
        type: "json_schema",
        name: "judge_report",
        schema: judgeSchema,
        strict: true
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as Omit<JudgeReport, "id" | "createdAt">;
  return {
    suggestedEvidence: evidence,
    report: {
      id: createId("judge"),
      createdAt: nowIso(),
      ...parsed
    }
  };
}

async function runPostmortem(client: OpenAI, session: DebateSession): Promise<PostmortemReport> {
  const response = await client.responses.create({
    model: getLlmConfig()?.models[0] ?? "gpt-4o-mini",
    instructions: [
      "You are writing a structured postmortem for an AI debate.",
      "Score the debate on five dimensions from 1 to 10 and explain the strongest and weakest parts.",
      "Return only JSON matching the schema."
    ].join("\n\n"),
    input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(session.evidence)].join("\n\n"),
    text: {
      format: {
        type: "json_schema",
        name: "postmortem_report",
        schema: postmortemSchema,
        strict: true
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as Omit<PostmortemReport, "id" | "createdAt"> & { scorecard: PostmortemScorecard };
  return {
    id: createId("postmortem"),
    createdAt: nowIso(),
    ...parsed
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as DebateActionRequest | null;
  const baseSession = body?.session;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      if (!baseSession) {
        send({ type: "error", error: "Missing session payload.", suggestedEvidence: [] });
        controller.close();
        return;
      }

      try {
        const config = getLlmConfig();
        const client = config ? getClient(config) : null;
        let session = { ...baseSession, updatedAt: nowIso() };
        const requestedAction = body?.requestedAction ?? "send_turn";

        send({ type: "session_meta", title: session.title, mode: session.mode, updatedAt: session.updatedAt });

        if (requestedAction === "send_turn") {
          send({ type: "status", status: "Checking pasted links and preparing sources..." });
          session = appendUserMessage(session, body?.userMessage);
          send({ type: "status", status: session.settings.enableSearch && body?.userMessage?.trim() ? "Searching Tavily for supporting evidence..." : "Using the current evidence set..." });

          const { mergedEvidence, liveEvidence } = await resolveEvidence(session, body?.userMessage);
          session = { ...session, evidence: mergedEvidence };
          send({ type: "evidence", suggestedEvidence: mergedEvidence, usedLiveSearch: liveEvidence.length > 0 });
          send({ type: "status", status: "Planning the next speaker..." });

          const response = await generateDebateResponse(session);
          if (!response.draftMessage) {
            send({
              type: "error",
              error: response.error ?? "No live reply could be generated.",
              attemptedModels: response.attemptedModels,
              suggestedEvidence: mergedEvidence,
              provider: response.provider ?? "mock-fallback",
              model: response.model ?? "mock-fallback"
            });
            send({ type: "done", suggestedEvidence: mergedEvidence, usedLiveSearch: liveEvidence.length > 0, attemptedModels: response.attemptedModels });
            controller.close();
            return;
          }

          send({
            type: "message_start",
            draftMessage: { ...response.draftMessage, content: "" },
            evidenceUsed: response.evidenceUsed,
            provider: response.provider,
            model: response.model
          });
          send({ type: "status", status: `${response.draftMessage.speaker} is replying...` });

          let streamedContent = "";
          for (const segment of splitForStreaming(response.draftMessage.content)) {
            streamedContent += segment;
            send({ type: "message_delta", delta: segment });
            await sleep(getStreamingDelay(segment));
          }

          session = {
            ...session,
            messages: [...session.messages, { ...response.draftMessage, content: streamedContent }],
            messageEvidenceMap: {
              ...session.messageEvidenceMap,
              [response.draftMessage.id]: response.evidenceUsed
            },
            modeState: {
              ...session.modeState,
              completedAiTurns: countAiTurns({ ...session, messages: [...session.messages, { ...response.draftMessage, content: streamedContent }] }),
              stanceShiftActive: shouldActivateStanceShift(session),
              stanceShiftApplied: session.mode === "stance_shift" ? session.modeState.stanceShiftApplied || shouldActivateStanceShift(session) : session.modeState.stanceShiftApplied
            }
          };

          send({
            type: "message_done",
            draftMessage: { ...response.draftMessage, content: streamedContent },
            evidenceUsed: response.evidenceUsed,
            provider: response.provider,
            model: response.model,
            attemptedModels: response.attemptedModels
          });
          send({ type: "mode_state", modeState: session.modeState });

          if (client && session.mode === "jury") {
            send({ type: "analysis_start", analysisType: "jury", status: "Gathering jury votes across models..." });
            const juryRound = await runJury(client, session);
            send({ type: "analysis_result", analysisType: "jury", result: juryRound });
            session = { ...session, analysis: { ...session.analysis, juryRounds: [...session.analysis.juryRounds, juryRound] }, modeState: { ...session.modeState, lastAnalysisType: "jury" } };
            send({ type: "mode_state", modeState: session.modeState });
          }

          if (client && session.mode === "networked_judge") {
            send({ type: "analysis_start", analysisType: "judge", status: "Running the networked judge..." });
            const judge = await runJudge(client, session);
            session = { ...session, evidence: judge.suggestedEvidence, analysis: { ...session.analysis, judgeReports: [...session.analysis.judgeReports, judge.report] }, modeState: { ...session.modeState, lastAnalysisType: "judge" } };
            send({ type: "evidence", suggestedEvidence: judge.suggestedEvidence, usedLiveSearch: true });
            send({ type: "analysis_result", analysisType: "judge", result: judge.report });
            send({ type: "mode_state", modeState: session.modeState });
          }

          send({ type: "session_meta", title: session.title, mode: session.mode, updatedAt: nowIso() });
          send({ type: "done", suggestedEvidence: session.evidence, usedLiveSearch: session.settings.enableSearch, attemptedModels: response.attemptedModels });
          controller.close();
          return;
        }

        if (!client) {
          send({ type: "error", error: "A live model is required for this action.", suggestedEvidence: session.evidence });
          controller.close();
          return;
        }

        if (requestedAction === "run_judge") {
          send({ type: "analysis_start", analysisType: "judge", status: "Running the networked judge..." });
          const judge = await runJudge(client, session);
          session = { ...session, evidence: judge.suggestedEvidence, analysis: { ...session.analysis, judgeReports: [...session.analysis.judgeReports, judge.report] }, modeState: { ...session.modeState, lastAnalysisType: "judge" } };
          send({ type: "evidence", suggestedEvidence: judge.suggestedEvidence, usedLiveSearch: true });
          send({ type: "analysis_result", analysisType: "judge", result: judge.report });
          send({ type: "mode_state", modeState: session.modeState });
          send({ type: "done", suggestedEvidence: session.evidence, usedLiveSearch: true });
          controller.close();
          return;
        }

        send({ type: "analysis_start", analysisType: "postmortem", status: "Generating debate postmortem..." });
        const postmortem = await runPostmortem(client, session);
        session = { ...session, analysis: { ...session.analysis, postmortems: [...session.analysis.postmortems, postmortem] }, modeState: { ...session.modeState, lastAnalysisType: "postmortem" } };
        send({ type: "analysis_result", analysisType: "postmortem", result: postmortem });
        send({ type: "mode_state", modeState: session.modeState });
        send({ type: "done", suggestedEvidence: session.evidence, usedLiveSearch: false });
        controller.close();
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Request failed.",
          attemptedModels: [],
          suggestedEvidence: baseSession.evidence
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
