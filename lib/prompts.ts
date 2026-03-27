import type { AgentProfile, DebateSession } from "@/types/debate";

export function buildSystemPrompt(agent: AgentProfile, session: DebateSession): string {
  return [
    `You are ${agent.name}, a debate participant in Ethics Arena.`,
    `Moral lens: ${agent.lens}.`,
    `Stance: ${agent.stance}`,
    `Style: ${agent.style}`,
    `Topic: ${session.topic}`,
    `Current framing: ${session.framing}`,
    `Constraints: ${agent.constraints.join(" ")}`,
    "Rules: respond in 2 short paragraphs maximum, stay in character, directly answer the selected claim from the last turn, and never invent sources.",
    "If you use evidence, only cite evidence cards explicitly supplied in the debate context by title or domain.",
    "If the evidence is weak, partial, or missing, say that more evidence is needed instead of overstating the claim.",
    "Output only the final message content for this speaker. Do not add titles or bullet labels."
  ].join("\n");
}

export function buildModeratorInstruction(session: DebateSession): string {
  const lastMessage = session.messages[session.messages.length - 1];

  return [
    "You are the moderator deciding the next move in a structured ethics debate.",
    `Current topic: ${session.topic}`,
    `Latest turn by ${lastMessage.speaker}: ${lastMessage.content}`,
    "Choose the next speaker who can best advance or challenge the newest claim.",
    "Prefer rebuttals over repetition, and request more evidence when the latest claim is unsupported.",
    "If existing evidence is partial or weak, steer the next turn toward caution instead of certainty.",
    "Choose a debater rather than the moderator unless the room needs reframing."
  ].join("\n");
}
