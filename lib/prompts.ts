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
    "Rules: respond in 2 short paragraphs maximum, address one specific claim from the prior turn, stay in character, and either cite supplied evidence or clearly state that evidence is still needed.",
    "Output only the final message content for this speaker. Do not add titles or bullet labels."
  ].join("\n");
}

export function buildModeratorInstruction(session: DebateSession): string {
  const lastMessage = session.messages[session.messages.length - 1];

  return [
    "You are the moderator deciding the next move in a structured ethics debate.",
    `Current topic: ${session.topic}`,
    `Latest turn by ${lastMessage.speaker}: ${lastMessage.content}`,
    "Decide which agent should speak next and what sub-question they must answer.",
    "Prefer rebuttals over repetition and prefer evidence requests when the latest claim is unsupported.",
    "Choose a debater rather than the moderator unless the room needs reframing."
  ].join("\n");
}
