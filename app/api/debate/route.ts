import OpenAI from "openai";
import { defaultAgents } from "@/data/agents";
import { sampleSession } from "@/data/sample-session";
import { createMockDebateResponse } from "@/lib/mock-debate";
import { buildModeratorInstruction, buildSystemPrompt } from "@/lib/prompts";
import type { DebateMessage, DebateResponse, DebateSession, EvidenceCard } from "@/types/debate";

interface DebateRequestBody {
  topic?: string;
  userMessage?: string;
  history?: DebateMessage[];
  evidence?: EvidenceCard[];
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const responseSchema = {
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
    draftMessage: {
      type: "string"
    }
  },
  required: ["nextSpeakerId", "moderatorInstruction", "draftMessage"]
} as const;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

function buildDebateInput(session: DebateSession): string {
  const transcript = session.messages
    .map((message) => `Turn ${message.turn} | ${message.speaker} (${message.role}): ${message.content}`)
    .join("\n");
  const evidence = session.evidence
    .map((item) => `- ${item.title} [${item.type}] used by ${item.usedBy}: ${item.summary} (${item.url})`)
    .join("\n");
  const agentSummaries = session.agents
    .filter((agent) => agent.role !== "user")
    .map((agent) => `${agent.id}: ${agent.name} | ${agent.lens} | ${agent.stance}`)
    .join("\n");

  return [
    `Topic: ${session.topic}`,
    `Framing: ${session.framing}`,
    "Available agents:",
    agentSummaries,
    "Transcript:",
    transcript,
    "Evidence available:",
    evidence || "No evidence cards supplied yet.",
    "Return the next speaker id, the moderator instruction for that speaker, and the speaker's actual draft message."
  ].join("\n\n");
}

async function generateDebateResponse(session: DebateSession): Promise<DebateResponse> {
  const client = getClient();

  if (!client) {
    return createMockDebateResponse(session);
  }

  const moderatorInstructions = buildModeratorInstruction(session);
  const agentPromptPack = session.agents
    .filter((agent) => agent.role !== "user")
    .map((agent) => `${agent.id}\n${buildSystemPrompt(agent, session)}`)
    .join("\n\n");

  const response = await client.responses.create({
    model: MODEL,
    instructions: [
      "You orchestrate a multi-agent ethics debate.",
      moderatorInstructions,
      "You must select one next speaker from the provided agent ids.",
      "When writing the draft message, fully embody the chosen agent's moral lens, stance, and style.",
      "Keep the draft message under 140 words and make it directly responsive to the latest turn.",
      "Use only the JSON schema requested in text.format.",
      "Agent prompt pack:",
      agentPromptPack
    ].join("\n\n"),
    input: buildDebateInput(session),
    text: {
      format: {
        type: "json_schema",
        name: "debate_turn",
        schema: responseSchema,
        strict: true
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as {
    nextSpeakerId: string;
    moderatorInstruction: string;
    draftMessage: string;
  };
  const speaker = defaultAgents.find((agent) => agent.id === parsed.nextSpeakerId) ?? defaultAgents[0];

  return {
    nextSpeakerId: speaker.id,
    moderatorInstruction: parsed.moderatorInstruction,
    draftMessage: {
      id: `draft-${session.messages.length + 1}`,
      speakerId: speaker.id,
      speaker: speaker.name,
      role: speaker.role,
      turn: session.messages.length + 1,
      content: parsed.draftMessage
    },
    suggestedEvidence: session.evidence.slice(0, 2)
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as DebateRequestBody | null;
  const session = buildSession(body);
  const response = await generateDebateResponse(session);

  return Response.json({
    ...response,
    model: process.env.OPENAI_API_KEY ? MODEL : "mock-fallback",
    usedLiveModel: Boolean(process.env.OPENAI_API_KEY)
  });
}
