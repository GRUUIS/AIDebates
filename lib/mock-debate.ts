import { defaultAgents } from "@/data/agents";
import type { AgentProfile, DebateMessage, DebateResponse, DebateSession } from "@/types/debate";

function findAgent(agentId: string): AgentProfile {
  return defaultAgents.find((agent) => agent.id === agentId) ?? defaultAgents[0];
}

function chooseNextSpeaker(messages: DebateMessage[]): AgentProfile {
  const lastSpeakerId = messages[messages.length - 1]?.speakerId;

  if (lastSpeakerId === "user") {
    return findAgent("policy");
  }

  if (lastSpeakerId === "utilitarian") {
    return findAgent("deontologist");
  }

  if (lastSpeakerId === "deontologist") {
    return findAgent("virtue");
  }

  return findAgent("utilitarian");
}

export function createMockDebateResponse(session: DebateSession): DebateResponse {
  const nextSpeaker = chooseNextSpeaker(session.messages);
  const latest = session.messages[session.messages.length - 1];

  return {
    nextSpeakerId: nextSpeaker.id,
    moderatorInstruction: `Ask ${nextSpeaker.name} to answer ${latest.speaker}'s latest claim and expose the strongest moral tradeoff instead of repeating generic principles.`,
    draftMessage: {
      id: `draft-${session.messages.length + 1}`,
      speakerId: nextSpeaker.id,
      speaker: nextSpeaker.name,
      role: nextSpeaker.role,
      turn: session.messages.length + 1,
      content:
        `${nextSpeaker.name} should now answer in character. This placeholder exists so the frontend and API contract can be built before wiring in the real OpenAI generation step.`
    },
    suggestedEvidence: [
      {
        id: "e3",
        title: "Meaningful Human Control in Autonomous Weapons Systems",
        type: "paper",
        summary: "Explores when human approval is substantive rather than merely formal in weapon decision chains.",
        url: "https://example.org/human-control",
        usedBy: nextSpeaker.name
      }
    ]
  };
}
