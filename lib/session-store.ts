import { defaultAgents } from "@/data/agents";
import type { AgentProfile, AgentState, CreateSessionInput, DebateMessage, DebateMode, DebateSession, SessionSummary } from "@/types/debate";

const SESSION_INDEX_KEY = "ethics-arena-session-index-v1";
const SESSION_PREFIX = "ethics-arena-session-v1:";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function buildSessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function readIndex(): SessionSummary[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SESSION_INDEX_KEY);
    return raw ? (JSON.parse(raw) as SessionSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(items: SessionSummary[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(items));
}

function buildSummary(session: DebateSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    topic: session.topic,
    mode: session.mode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    participantCount: session.agents.filter((agent) => agent.role !== "user").length
  };
}

function openingModeratorMessage(session: Pick<DebateSession, "topic" | "framing">): DebateMessage {
  return {
    id: createId("msg"),
    speakerId: "moderator",
    speaker: "Avery",
    role: "moderator",
    turn: 1,
    content: `Topic: ${session.topic}\n\nFraming: ${session.framing}\n\nI will moderate this debate. Start by challenging or defending the framing with specific reasons and evidence.`
  };
}

function normalizeAgents(agentIds: string[]): AgentProfile[] {
  const uniqueIds = Array.from(new Set(agentIds));
  const selected = defaultAgents.filter((agent) => uniqueIds.includes(agent.id));
  const withModerator = selected.some((agent) => agent.id === "moderator")
    ? selected
    : [defaultAgents.find((agent) => agent.id === "moderator")!, ...selected];

  const debaters = withModerator.filter((agent) => agent.role === "debater");
  if (debaters.length < 2) {
    const fallbacks = defaultAgents.filter((agent) => agent.role === "debater" && !withModerator.some((item) => item.id === agent.id)).slice(0, 2 - debaters.length);
    return [...withModerator, ...fallbacks];
  }

  return withModerator;
}

function buildAgentStateMap(agents: AgentProfile[]): Record<string, AgentState> {
  return Object.fromEntries(
    agents
      .filter((agent) => agent.role !== "user")
      .map((agent) => [
        agent.id,
        {
          currentClaim: agent.stance,
          usedEvidenceIds: [],
          recentClaimEmbeddings: []
        } satisfies AgentState
      ])
  );
}

export const debateModeMeta: Record<DebateMode, { label: string; description: string }> = {
  classic: {
    label: "Classic Debate",
    description: "Agents take structured turns arguing their philosophical lenses."
  },
  jury: {
    label: "Jury Simulation",
    description: "After the debate, a simulated jury breaks down how different demographics respond."
  },
  networked_judge: {
    label: "Networked Judge",
    description: "An AI judge observes arguments, tracks logic, and provides a final verdict."
  },
  stance_shift: {
    label: "Stance Shift Evaluation",
    description: "A pre- and post-debate check of simulated participant opinion shifts."
  },
  postmortem: {
    label: "Postmortem Analytics",
    description: "Analyze logical fallacies, emotional appeals, and key turning points of a past session."
  },
  human_vs_ai: {
    label: "Human vs AI",
    description: "You debate directly against an active AI agent."
  }
};

export function createSession(input: CreateSessionInput): DebateSession {
  const timestamp = nowIso();
  const agents = normalizeAgents(input.agentIds);
  const draft: DebateSession = {
    id: createId("session"),
    title: input.title?.trim() || input.topic.trim(),
    topic: input.topic.trim(),
    framing: input.framing.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: input.mode,
    agents,
    messages: [],
    evidence: [],
    removedEvidence: [],
    messageEvidenceMap: {},
    analysis: {
      juryRounds: [],
      judgeReports: [],
      postmortems: []
    },
    modeState: {
      completedAiTurns: 0,
      stanceShiftActive: false,
      stanceShiftApplied: false,
      switchedAgentIds: ["utilitarian", "deontologist"]
    },
    settings: {
      enableSearch: input.enableSearch ?? true,
      maxActiveEvidence: 8,
      juryEnabled: input.mode === "jury",
      autoSpeakResponses: false
    },
    agentStateMap: buildAgentStateMap(agents),
    userIntentState: {
      currentQuestion: input.topic.trim(),
      unansweredPoints: []
    },
    conversationFocus: input.topic.trim(),
    generatedAssets: []
  };

  draft.messages = [openingModeratorMessage(draft)];
  saveSession(draft);
  return draft;
}

export function createStarterSession(): DebateSession {
  return createSession({
    topic: "Should governments permit AI systems to make life-and-death decisions in battlefield settings?",
    framing: "The debate centers on whether delegating lethal decisions to autonomous systems can ever be morally justified once military necessity, civilian risk, accountability, and long-term norms are weighed together.",
    mode: "classic",
    agentIds: ["moderator", "utilitarian", "deontologist", "virtue", "policy"],
    enableSearch: true,
    title: "Autonomous Weapons Debate"
  });
}

export function listSessions(): SessionSummary[] {
  return [...readIndex()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getSession(id: string): DebateSession | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(buildSessionKey(id));
    return raw ? (JSON.parse(raw) as DebateSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: DebateSession): DebateSession {
  if (!canUseStorage()) {
    return session;
  }

  const next = {
    ...session,
    updatedAt: nowIso()
  };

  window.localStorage.setItem(buildSessionKey(next.id), JSON.stringify(next));
  const index = readIndex();
  const summary = buildSummary(next);
  const remaining = index.filter((item) => item.id !== next.id);
  writeIndex([summary, ...remaining]);
  return next;
}

export function updateSession(session: DebateSession): DebateSession {
  return saveSession(session);
}

export function deleteSession(id: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(buildSessionKey(id));
  writeIndex(readIndex().filter((item) => item.id !== id));
}

export function duplicateSession(id: string): DebateSession | null {
  const session = getSession(id);
  if (!session) {
    return null;
  }

  const idMap = new Map<string, string>();
  for (const message of session.messages) {
    idMap.set(message.id, createId("msg"));
  }

  const copy: DebateSession = {
    ...session,
    id: createId("session"),
    title: `${session.title} Copy`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: session.messages.map((message) => ({
      ...message,
      id: idMap.get(message.id) ?? createId("msg"),
      replyToMessageId: message.replyToMessageId ? idMap.get(message.replyToMessageId) : undefined
    })),
    evidence: [...session.evidence],
    removedEvidence: [...session.removedEvidence],
    messageEvidenceMap: Object.fromEntries(
      Object.entries(session.messageEvidenceMap).map(([messageId, evidenceIds]) => [idMap.get(messageId) ?? messageId, [...evidenceIds]])
    ),
    analysis: {
      juryRounds: [...session.analysis.juryRounds],
      judgeReports: [...session.analysis.judgeReports],
      postmortems: [...session.analysis.postmortems]
    },
    modeState: { ...session.modeState },
    agentStateMap: structuredClone(session.agentStateMap),
    userIntentState: session.userIntentState ? structuredClone(session.userIntentState) : undefined,
    generatedAssets: [...session.generatedAssets]
  };

  return saveSession(copy);
}

export function ensureStarterSession(): DebateSession {
  const sessions = listSessions();
  if (sessions.length > 0) {
    const existing = getSession(sessions[0].id);
    if (existing) {
      return existing;
    }
  }

  return createStarterSession();
}

