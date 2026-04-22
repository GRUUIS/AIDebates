import { defaultAgents } from "@/data/agents";
import { dedupeEvidence, findOpposingEvidence, findRelevantEvidence, findSimilarClaims, indexClaimText } from "@/lib/embeddings";
import { importEvidenceFromUrl, mergeEvidence, searchEvidence } from "@/lib/evidence";
import { generateStructuredObject, getLlmConfig } from "@/lib/llm";
import { createMockDebateResponse } from "@/lib/mock-debate";
import { buildModeratorInstruction, buildRelevantTranscript, buildSystemPrompt, describeIntent } from "@/lib/prompts";
import type {
  AgentState,
  DebateActionRequest,
  DebateIntent,
  DebateMessage,
  DebateResponse,
  DebateSession,
  EvidenceCard,
  JudgeReport,
  JuryRound,
  JurorResult,
  PostmortemReport,
  PostmortemScorecard,
  UserIntentState
} from "@/types/debate";

function getJuryModels(): string[] {
  const config = getLlmConfig();
  if (config?.provider === "vertex") {
    return ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"];
  }

  return ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "google/gemini-2.0-flash-001"];
}

interface TurnPlan {
  nextSpeakerId: string;
  moderatorInstruction: string;
  claimToAnswer: string;
  evidenceIds: string[];
  needsMoreEvidence: boolean;
  replyToMessageId?: string;
  targetSpeakerId?: string;
  intent: DebateIntent;
  conversationFocus: string;
}

interface GeneratedTurn {
  visibleMessage: string;
  privateStateUpdate: AgentState;
}

type StreamEvent =
  | { type: "status"; status: string }
  | { type: "evidence"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean }
  | { type: "message_start"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string }
  | { type: "message_delta"; delta: string }
  | { type: "message_done"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string; attemptedModels?: string[]; agentStateMap: DebateSession["agentStateMap"]; userIntentState?: UserIntentState; conversationFocus?: string }
  | { type: "analysis_start"; analysisType: "jury" | "judge" | "postmortem"; status: string }
  | { type: "analysis_result"; analysisType: "jury" | "judge" | "postmortem"; result: JuryRound | JudgeReport | PostmortemReport }
  | { type: "session_meta"; title: string; mode: DebateSession["mode"]; updatedAt: string }
  | { type: "mode_state"; modeState: DebateSession["modeState"] }
  | { type: "done"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean; attemptedModels?: string[] }
  | { type: "error"; error: string; attemptedModels?: string[]; suggestedEvidence: EvidenceCard[]; provider?: string; model?: string };

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nextSpeakerId: {
      type: "string",
      enum: defaultAgents.filter((agent) => agent.role !== "user").map((agent) => agent.id)
    },
    moderatorInstruction: { type: "string" },
    claimToAnswer: { type: "string" },
    evidenceIds: { type: "array", items: { type: "string" } },
    needsMoreEvidence: { type: "boolean" },
    replyToMessageId: { type: "string" },
    targetSpeakerId: { type: "string" },
    intent: { type: "string", enum: ["answer_user", "rebut", "support", "clarify", "question", "synthesize"] },
    conversationFocus: { type: "string" }
  },
  required: ["nextSpeakerId", "moderatorInstruction", "claimToAnswer", "evidenceIds", "needsMoreEvidence", "intent", "conversationFocus"]
} as const;

const generatedTurnSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    visibleMessage: { type: "string" },
    privateStateUpdate: {
      type: "object",
      additionalProperties: false,
      properties: {
        currentClaim: { type: "string" },
        nextQuestion: { type: "string" },
        opponentFocusId: { type: "string" },
        usedEvidenceIds: { type: "array", items: { type: "string" } },
        recentClaimEmbeddings: { type: "array", items: { type: "string" } }
      },
      required: ["currentClaim", "usedEvidenceIds", "recentClaimEmbeddings"]
    }
  },
  required: ["visibleMessage", "privateStateUpdate"]
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
        content: trimmed,
        intent: "answer_user"
      }
    ]
  };
}

function ensureSessionDefaults(session: DebateSession): DebateSession {
  const agentStateMap = session.agentStateMap ?? Object.fromEntries(
    session.agents
      .filter((agent) => agent.role !== "user")
      .map((agent) => [agent.id, { currentClaim: agent.stance, usedEvidenceIds: [], recentClaimEmbeddings: [] } satisfies AgentState])
  );

  return {
    ...session,
    agentStateMap,
    generatedAssets: session.generatedAssets ?? [],
    userIntentState: session.userIntentState ?? { currentQuestion: session.topic, unansweredPoints: [] },
    conversationFocus: session.conversationFocus ?? session.topic,
    settings: {
      ...session.settings,
      autoSpeakResponses: session.settings.autoSpeakResponses ?? false
    }
  };
}

function updateUserIntentState(session: DebateSession, userMessage?: string): DebateSession {
  const trimmed = userMessage?.trim();
  if (!trimmed) {
    return session;
  }

  return {
    ...session,
    userIntentState: {
      currentQuestion: trimmed,
      unansweredPoints: [trimmed]
    },
    conversationFocus: trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed
  };
}

function buildEvidenceDigest(evidence: EvidenceCard[]): string {
  if (!evidence.length) {
    return "No evidence cards supplied yet.";
  }

  return evidence
    .map((item) => {
      const claimText = item.claims?.length ? ` claims=${item.claims.join(" | ")}` : "";
      return `- ${item.id} | ${item.title} | ${item.domain} | ${item.type} | credibility=${item.credibility} | status=${item.retrievalStatus} | ${item.excerpt}${claimText} (${item.url})`;
    })
    .join("\n");
}

function buildTranscript(session: DebateSession): string {
  return buildRelevantTranscript(session.messages);
}

function buildAgentSummaries(session: DebateSession): string {
  return session.agents
    .filter((agent) => agent.role !== "user")
    .map((agent) => {
      const state = session.agentStateMap[agent.id];
      return `${agent.id}: ${agent.name} | ${agent.lens} | ${agent.stance} | currentClaim=${state?.currentClaim ?? agent.stance} | opponentFocus=${state?.opponentFocusId ?? "none"}`;
    })
    .join("\n");
}

function countAiTurns(session: DebateSession): number {
  return session.messages.filter((message) => message.role !== "user").length;
}

function shouldActivateStanceShift(session: DebateSession): boolean {
  return session.mode === "stance_shift" && !session.modeState.stanceShiftApplied && countAiTurns(session) >= 4;
}

function shouldStopForHumanTurn(session: DebateSession): boolean {
  // If mode is human_vs_ai, we want to pause and wait for the human instead of having AI automatically continue.
  // We'll let the AI respond to the human, and then stop so the human can reply again.
  if (session.mode !== "human_vs_ai") {
    return false;
  }
  
  if (session.messages.length === 0) {
    return false;
  }
  
  const lastMessage = session.messages[session.messages.length - 1];
  // If the last message was NOT from a user, we should stop and wait for the human.
  // This means the AI just took its turn, so now it's the human's turn.
  return lastMessage.role !== "user";
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
  const merged = await dedupeEvidence(mergeEvidence(session.evidence, importedFromMessage, liveEvidence));
  return {
    mergedEvidence: merged.slice(0, maxEvidence),
    liveEvidence
  };
}

function shouldTryNextModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("not available in your region") || message.includes("rate limit") || message.includes("temporarily") || message.includes("overloaded") || message.includes("provider returned error") || message.includes("unsupported") || message.includes("timeout") || message.includes("503") || message.includes("429") || message.includes("403");
}

function findLastMessageByRole(session: DebateSession, role: DebateMessage["role"]): DebateMessage | undefined {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    if (session.messages[index].role === role) {
      return session.messages[index];
    }
  }
  return undefined;
}

function findMostOpposedSpeaker(session: DebateSession, targetSpeakerId?: string): string {
  const debaters = session.agents.filter((agent) => agent.role === "debater");
  if (!targetSpeakerId) {
    return debaters[0]?.id ?? "moderator";
  }

  const target = session.agents.find((agent) => agent.id === targetSpeakerId);
  const preferred = debaters.find((agent) => agent.id !== targetSpeakerId && agent.lens !== target?.lens);
  return preferred?.id ?? debaters.find((agent) => agent.id !== targetSpeakerId)?.id ?? "moderator";
}
async function buildPlannerHints(session: DebateSession, userMessage?: string) {
  const latestMessage = session.messages[session.messages.length - 1];
  const latestUserMessage = userMessage?.trim() ? latestMessage : findLastMessageByRole(session, "user");
  const latestNonUserMessage = [...session.messages].reverse().find((message) => message.role !== "user");
  const replyTarget = latestMessage.role === "user" ? latestNonUserMessage : latestMessage;
  const intent: DebateIntent = latestMessage.role === "user" ? "answer_user" : replyTarget?.role === "moderator" ? "clarify" : "rebut";
  const heuristicSpeakerId = intent === "answer_user" ? findMostOpposedSpeaker(session, latestNonUserMessage?.speakerId) : findMostOpposedSpeaker(session, replyTarget?.speakerId);
  const claimToAnswer = latestMessage.content;
  const relevantEvidence = await findRelevantEvidence(latestUserMessage?.content ?? claimToAnswer, session.evidence, 4);
  const opposingEvidence = await findOpposingEvidence(claimToAnswer, session.evidence, 3, relevantEvidence.map((item) => item.id));
  const recentRelatedMessages = await findSimilarClaims(claimToAnswer, session.messages, 4, latestMessage.id);

  return {
    latestMessage,
    latestUserMessage,
    replyTarget,
    intent,
    heuristicSpeakerId,
    claimToAnswer,
    candidateEvidence: [...relevantEvidence, ...opposingEvidence].slice(0, 6),
    recentRelatedMessages
  };
}

async function planTurn(model: string, session: DebateSession, userMessage?: string): Promise<TurnPlan> {
  const moderatorInstructions = buildModeratorInstruction(session);
  const stanceShiftDirective = shouldActivateStanceShift(session)
    ? `Stance shift is active. Prefer choosing one of these debaters next: ${(session.modeState.switchedAgentIds ?? ["utilitarian", "deontologist"]).join(", ")}.`
    : "";
  const hints = await buildPlannerHints(session, userMessage);

  const response = await generateStructuredObject({
    model,
    instructions: [
      "You plan the next turn in a multi-agent ethics debate.",
      moderatorInstructions,
      stanceShiftDirective,
      `Heuristic target intent: ${hints.intent}.`,
      `Heuristic next speaker candidate: ${hints.heuristicSpeakerId}.`,
      `Prefer replyToMessageId=${hints.replyTarget?.id ?? "none"} when it fits.`,
      "If the latest message is from the user, the first AI response should directly answer the user before broadening the debate.",
      "When the latest message is from a debater, prefer a different debater who can rebut that claim instead of repeating it.",
      "Choose only evidence ids that are already available.",
      "Prefer strong evidence cards with retrievalStatus ok or partial. Ignore failed evidence unless explicitly discussing the lack of evidence.",
      "If the evidence is weak, set needsMoreEvidence to true and make the moderator instruction request better sourcing.",
      "Return only JSON that matches the supplied schema."
    ].filter(Boolean).join("\n\n"),
    input: [
      `Topic: ${session.topic}`,
      `Framing: ${session.framing}`,
      `Conversation focus: ${session.conversationFocus ?? session.topic}`,
      `Latest user intent: ${session.userIntentState?.currentQuestion ?? "No fresh user question"}`,
      "Available agents:",
      buildAgentSummaries(session),
      "Transcript:",
      buildTranscript(session),
      "Recent relevant exchanges:",
      buildRelevantTranscript(hints.recentRelatedMessages),
      "Evidence available:",
      buildEvidenceDigest(session.evidence),
      "Candidate evidence to consider first:",
      buildEvidenceDigest(hints.candidateEvidence),
      `Heuristic claim to answer: ${hints.claimToAnswer}`
    ].join("\n\n"),
    schema: plannerSchema
  });

  const parsed = JSON.parse(response) as TurnPlan;
  return {
    ...parsed,
    intent: parsed.intent ?? hints.intent,
    conversationFocus: parsed.conversationFocus || session.conversationFocus || session.topic,
    replyToMessageId: parsed.replyToMessageId || hints.replyTarget?.id,
    targetSpeakerId: parsed.targetSpeakerId || hints.replyTarget?.speakerId,
    claimToAnswer: parsed.claimToAnswer || hints.claimToAnswer,
    evidenceIds: (parsed.evidenceIds?.length ?? 0) > 0 ? parsed.evidenceIds : hints.candidateEvidence.map((item) => item.id).slice(0, 3)
  };
}

async function generateSpeakerTurn(model: string, session: DebateSession, plan: TurnPlan): Promise<GeneratedTurn> {
  const speaker = session.agents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
  const selectedEvidence = session.evidence.filter((item) => plan.evidenceIds.includes(item.id));
  const replyTarget = plan.replyToMessageId ? session.messages.find((message) => message.id === plan.replyToMessageId) : undefined;
  const stanceShiftActive = shouldActivateStanceShift(session) && (session.modeState.switchedAgentIds ?? []).includes(speaker.id);
  const recentSimilarClaims = await findSimilarClaims(session.agentStateMap[speaker.id]?.currentClaim ?? speaker.stance, session.messages, 3, replyTarget?.id);

  const response = await generateStructuredObject({
    model,
    instructions: [
      buildSystemPrompt(speaker, session),
      `Moderator instruction: ${plan.moderatorInstruction}`,
      `Intent for this turn: ${plan.intent}. ${describeIntent(plan.intent)}`,
      `Claim to answer: ${plan.claimToAnswer}`,
      replyTarget ? `Reply target: ${replyTarget.speaker} said: ${replyTarget.content}` : "Reply target: address the live question in the room.",
      plan.needsMoreEvidence ? "The evidence is incomplete. Be explicit about uncertainty and ask for better sourcing if needed." : "Use the best available evidence naturally without overstating confidence.",
      stanceShiftActive
        ? "Stance shift is active. Steelman the opposing side as strongly as possible while keeping the same moral lens. This is temporary and should read as an intentional reversal, not a permanent character rewrite."
        : "",
      "Return JSON with visibleMessage and privateStateUpdate.",
      "privateStateUpdate.currentClaim should capture the main point you just advanced.",
      "privateStateUpdate.usedEvidenceIds should list only evidence ids actually relied on."
    ].filter(Boolean).join("\n\n"),
    input: [
      "Latest transcript:",
      buildTranscript(session),
      "Most relevant earlier exchanges to avoid repetition:",
      buildRelevantTranscript(recentSimilarClaims),
      "Selected evidence cards:",
      buildEvidenceDigest(selectedEvidence),
      "Write the next speaker's reply now."
    ].join("\n\n"),
    schema: generatedTurnSchema
  });

  return JSON.parse(response) as GeneratedTurn;
}

async function generateDebateResponse(session: DebateSession, userMessage?: string): Promise<DebateResponse & { provider?: string; model?: string; usedLiveModel?: boolean; privateStateUpdate?: AgentState; conversationFocus?: string; userIntentState?: UserIntentState }> {
  const config = getLlmConfig();

  if (!config) {
    return {
      ...createMockDebateResponse(session),
      provider: "mock-fallback",
      model: "mock-fallback",
      usedLiveModel: false
    };
  }

  const attemptedModels: string[] = [];
  let lastError: unknown = null;

  for (const model of config.models) {
    attemptedModels.push(model);

    try {
      const plan = await planTurn(model, session, userMessage);
      const speaker = session.agents.find((agent) => agent.id === plan.nextSpeakerId) ?? defaultAgents[0];
      const turn = await generateSpeakerTurn(model, session, plan);

      return {
        nextSpeakerId: speaker.id,
        moderatorInstruction: plan.moderatorInstruction,
        draftMessage: {
          id: `draft-${session.messages.length + 1}`,
          speakerId: speaker.id,
          speaker: speaker.name,
          role: speaker.role,
          turn: session.messages.length + 1,
          content: turn.visibleMessage.trim(),
          replyToMessageId: plan.replyToMessageId,
          targetSpeakerId: plan.targetSpeakerId,
          intent: plan.intent,
          citations: plan.evidenceIds
        },
        suggestedEvidence: session.evidence,
        evidenceUsed: plan.evidenceIds,
        attemptedModels,
        provider: config.provider,
        model,
        usedLiveModel: true,
        privateStateUpdate: turn.privateStateUpdate,
        conversationFocus: plan.conversationFocus,
        userIntentState: session.userIntentState
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
async function runJury(session: DebateSession): Promise<JuryRound> {
  const jurors = await Promise.all(
    getJuryModels().map(async (model, index) => {
      try {
        const response = await generateStructuredObject({
          model,
          instructions: [
            "You are a juror evaluating an AI debate.",
            "Choose the current winner, explain why, and provide a 0-100 confidence score.",
            "Use only the supplied transcript and evidence digest.",
            "Return only JSON matching the schema.",
            `Juror perspective variant: ${index + 1}. Keep the verdict independent and fair.`
          ].join("\n\n"),
          input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(session.evidence)].join("\n\n"),
          schema: jurySchema
        });

        const parsed = JSON.parse(response) as Omit<JurorResult, "jurorModel">;
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

async function runJudge(session: DebateSession): Promise<{ report: JudgeReport; suggestedEvidence: EvidenceCard[] }> {
  const judgeQuery = `${session.topic} ${session.messages.slice(-3).map((message) => message.content).join(" ")}`;
  const judgeEvidence = await searchEvidence(judgeQuery, session.topic).catch(() => [] as EvidenceCard[]);
  const evidence = mergeEvidence(session.evidence, judgeEvidence).slice(0, session.settings.maxActiveEvidence ?? 8);

  const response = await generateStructuredObject({
    model: getLlmConfig()?.models[0] ?? "gpt-4o-mini",
    instructions: [
      "You are a networked judge for an AI ethics debate.",
      "Summarize what is supported, what is weakly supported, and what evidence is still missing.",
      "Return only JSON matching the schema."
    ].join("\n\n"),
    input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(evidence)].join("\n\n"),
    schema: judgeSchema
  });

  const parsed = JSON.parse(response) as Omit<JudgeReport, "id" | "createdAt">;
  return {
    suggestedEvidence: evidence,
    report: {
      id: createId("judge"),
      createdAt: nowIso(),
      ...parsed
    }
  };
}

async function runPostmortem(session: DebateSession): Promise<PostmortemReport> {
  const response = await generateStructuredObject({
    model: getLlmConfig()?.models[0] ?? "gpt-4o-mini",
    instructions: [
      "You are writing a structured postmortem for an AI debate.",
      "Score the debate on five dimensions from 1 to 10 and explain the strongest and weakest parts.",
      "Return only JSON matching the schema."
    ].join("\n\n"),
    input: ["Transcript:", buildTranscript(session), "Evidence:", buildEvidenceDigest(session.evidence)].join("\n\n"),
    schema: postmortemSchema
  });

  const parsed = JSON.parse(response) as Omit<PostmortemReport, "id" | "createdAt"> & { scorecard: PostmortemScorecard };
  return {
    id: createId("postmortem"),
    createdAt: nowIso(),
    ...parsed
  };
}

function mergeAgentState(current: DebateSession["agentStateMap"], speakerId: string, update?: AgentState, evidenceIds: string[] = []): DebateSession["agentStateMap"] {
  if (!update) {
    return current;
  }

  return {
    ...current,
    [speakerId]: {
      currentClaim: update.currentClaim,
      nextQuestion: update.nextQuestion,
      opponentFocusId: update.opponentFocusId,
      usedEvidenceIds: (update.usedEvidenceIds?.length ?? 0) > 0 ? update.usedEvidenceIds : evidenceIds,
      recentClaimEmbeddings: update.recentClaimEmbeddings
    }
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
        const hasLiveModel = Boolean(config);
        let session = ensureSessionDefaults({ ...baseSession, updatedAt: nowIso() });
        const requestedAction = body?.requestedAction ?? "send_turn";

        send({ type: "session_meta", title: session.title, mode: session.mode, updatedAt: session.updatedAt });

        if (requestedAction === "send_turn") {
          send({ type: "status", status: body?.userMessage?.trim() ? "Checking pasted links, uploads, and preparing sources..." : "Advancing the internal exchange with the current evidence set..." });
          session = appendUserMessage(session, body?.userMessage);
          session = updateUserIntentState(session, body?.userMessage);
          
          if (shouldStopForHumanTurn(session)) {
             send({ type: "status", status: "Waiting for human turn..." });
             send({ type: "done", suggestedEvidence: session.evidence, usedLiveSearch: false, attemptedModels: [] });
             controller.close();
             return;
          }

          send({ type: "status", status: session.settings.enableSearch && body?.userMessage?.trim() ? "Searching Tavily for supporting evidence..." : "Selecting the best current evidence..." });

          const { mergedEvidence, liveEvidence } = await resolveEvidence(session, body?.userMessage);
          session = { ...session, evidence: mergedEvidence };
          send({ type: "evidence", suggestedEvidence: mergedEvidence, usedLiveSearch: liveEvidence.length > 0 });
          send({ type: "status", status: "Planning the next speaker..." });

          const response = await generateDebateResponse(session, body?.userMessage);
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
          const updatedDraft = { ...response.draftMessage, content: streamedContent };
          const nextStateUpdate = response.privateStateUpdate
            ? {
                ...response.privateStateUpdate,
                recentClaimEmbeddings: (
                  await Promise.all([
                    indexClaimText(response.privateStateUpdate.currentClaim),
                    indexClaimText(streamedContent)
                  ])
                ).filter(Boolean) as string[]
              }
            : undefined;

          session = {
            ...session,
            messages: [...session.messages, updatedDraft],
            messageEvidenceMap: {
              ...session.messageEvidenceMap,
              [updatedDraft.id]: response.evidenceUsed
            },
            agentStateMap: mergeAgentState(session.agentStateMap, updatedDraft.speakerId, nextStateUpdate, response.evidenceUsed),
            conversationFocus: response.conversationFocus ?? session.conversationFocus,
            userIntentState: response.userIntentState ?? session.userIntentState,
            modeState: {
              ...session.modeState,
              completedAiTurns: countAiTurns({ ...session, messages: [...session.messages, updatedDraft] }),
              stanceShiftActive: shouldActivateStanceShift(session),
              stanceShiftApplied: session.mode === "stance_shift" ? session.modeState.stanceShiftApplied || shouldActivateStanceShift(session) : session.modeState.stanceShiftApplied
            }
          };

          send({
            type: "message_done",
            draftMessage: updatedDraft,
            evidenceUsed: response.evidenceUsed,
            provider: response.provider,
            model: response.model,
            attemptedModels: response.attemptedModels,
            agentStateMap: session.agentStateMap,
            userIntentState: session.userIntentState,
            conversationFocus: session.conversationFocus
          });
          send({ type: "mode_state", modeState: session.modeState });

          if (hasLiveModel && session.mode === "jury") {
            send({ type: "analysis_start", analysisType: "jury", status: "Gathering jury votes across models..." });
            const juryRound = await runJury(session);
            send({ type: "analysis_result", analysisType: "jury", result: juryRound });
            session = { ...session, analysis: { ...session.analysis, juryRounds: [...session.analysis.juryRounds, juryRound] }, modeState: { ...session.modeState, lastAnalysisType: "jury" } };
            send({ type: "mode_state", modeState: session.modeState });
          }

          if (hasLiveModel && session.mode === "networked_judge") {
            send({ type: "analysis_start", analysisType: "judge", status: "Running the networked judge..." });
            const judge = await runJudge(session);
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

        if (!hasLiveModel) {
          send({ type: "error", error: "A live model is required for this action.", suggestedEvidence: session.evidence });
          controller.close();
          return;
        }

        if (requestedAction === "run_judge") {
          send({ type: "analysis_start", analysisType: "judge", status: "Running the networked judge..." });
          const judge = await runJudge(session);
          session = { ...session, evidence: judge.suggestedEvidence, analysis: { ...session.analysis, judgeReports: [...session.analysis.judgeReports, judge.report] }, modeState: { ...session.modeState, lastAnalysisType: "judge" } };
          send({ type: "evidence", suggestedEvidence: judge.suggestedEvidence, usedLiveSearch: true });
          send({ type: "analysis_result", analysisType: "judge", result: judge.report });
          send({ type: "mode_state", modeState: session.modeState });
          send({ type: "done", suggestedEvidence: session.evidence, usedLiveSearch: true });
          controller.close();
          return;
        }

        send({ type: "analysis_start", analysisType: "postmortem", status: "Generating debate postmortem..." });
        const postmortem = await runPostmortem(session);
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


