import { defaultAgents } from "@/data/agents";
import type { AgentProfile, CreateSessionInput, DebateMessage, DebateMode, DebateSession, SessionSummary } from "@/types/debate";

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

export const debateModeMeta: Record<DebateMode, { label: string; description: string }> = {
  classic: {
    label: "Classic",
    description: "Baseline moderator-led debate with the current multi-agent flow."
  },
  jury: {
    label: "Jury",
    description: "Adds a three-model jury panel after each AI turn."
  },
  networked_judge: {
    label: "Networked Judge",
    description: "Adds a fact-checking judge that can search for supporting or missing evidence."
  },
  stance_shift: {
    label: "Stance Shift",
    description: "Triggers a later steelman phase where key debaters argue the opposite side."
  },
  postmortem: {
    label: "Postmortem",
    description: "Optimized for an end-of-debate scorecard and structured retrospective."
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
      juryEnabled: input.mode === "jury"
    }
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

  const copy: DebateSession = {
    ...session,
    id: createId("session"),
    title: `${session.title} Copy`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: session.messages.map((message) => ({ ...message, id: createId("msg") })),
    evidence: [...session.evidence],
    removedEvidence: [...session.removedEvidence],
    messageEvidenceMap: { ...session.messageEvidenceMap },
    analysis: {
      juryRounds: [...session.analysis.juryRounds],
      judgeReports: [...session.analysis.judgeReports],
      postmortems: [...session.analysis.postmortems]
    },
    modeState: { ...session.modeState }
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
