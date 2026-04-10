import type { AgentProfile, DebateIntent, DebateMessage, DebateSession } from "@/types/debate";

function formatMessage(message: DebateMessage): string {
  return `Turn ${message.turn} | ${message.speaker} (${message.role}${message.intent ? `, ${message.intent}` : ""}): ${message.content}`;
}

export function buildSystemPrompt(agent: AgentProfile, session: DebateSession): string {
  return [
    `You are ${agent.name}, a debate participant in Ethics Arena.`,
    `Moral lens: ${agent.lens}.`,
    `Stance: ${agent.stance}`,
    `Style: ${agent.style}`,
    `Topic: ${session.topic}`,
    `Current framing: ${session.framing}`,
    `Conversation focus: ${session.conversationFocus ?? session.topic}`,
    `Latest user intent: ${session.userIntentState?.currentQuestion ?? "No fresh user question; continue the internal exchange."}`,
    `Constraints: ${agent.constraints.join(" ")}`,
    "Rules: respond in 2 short paragraphs maximum, stay in character, react directly to the targeted speaker or user, and never invent sources.",
    "You should sound like you are in a live exchange: quote or paraphrase the target claim, push back when needed, and avoid repeating your own last point.",
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
    `Conversation focus: ${session.conversationFocus ?? session.topic}`,
    `Latest turn by ${lastMessage.speaker}: ${lastMessage.content}`,
    `Latest user question or pressure point: ${session.userIntentState?.currentQuestion ?? "No fresh user input."}`,
    "Choose the next speaker who can most sharply answer the user or challenge the newest claim.",
    "Prefer rebuttals over repetition, and request more evidence when the latest claim is unsupported.",
    "If existing evidence is partial or weak, steer the next turn toward caution instead of certainty.",
    "Choose a debater rather than the moderator unless the room needs reframing or synthesis."
  ].join("\n");
}

export function buildRelevantTranscript(messages: DebateMessage[]): string {
  return messages.map(formatMessage).join("\n");
}

export function describeIntent(intent: DebateIntent): string {
  switch (intent) {
    case "answer_user":
      return "Directly answer the user's latest challenge or question before broadening the debate.";
    case "rebut":
      return "Directly challenge the target speaker's latest claim with a sharper counterargument.";
    case "support":
      return "Back up the target speaker while adding a distinct reason or evidence angle.";
    case "clarify":
      return "Clarify what is actually being claimed or what the evidence does and does not show.";
    case "question":
      return "Ask a pointed follow-up that exposes a weakness or missing premise.";
    case "synthesize":
      return "Summarize the live disagreement and identify the unresolved crux.";
    default:
      return "Advance the debate with a concrete and evidence-aware move.";
  }
}

