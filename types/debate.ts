export type AgentRole = "moderator" | "debater" | "user";

export type MoralLens =
  | "Utilitarian"
  | "Deontological"
  | "Virtue Ethics"
  | "Policy Pragmatist"
  | "Moderator";

export type DebateMode = "classic" | "jury" | "networked_judge" | "stance_shift" | "postmortem";
export type EvidenceType = "paper" | "article" | "case-study" | "video" | "image";
export type EvidenceSourceKind = "search" | "user-url" | "user-pdf";
export type EvidenceCredibility = "high" | "medium" | "low";
export type EvidenceRetrievalStatus = "ok" | "partial" | "failed";

export interface AgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  lens: MoralLens;
  stance: string;
  style: string;
  constraints: string[];
  color: string;
}

export interface EvidenceCard {
  id: string;
  title: string;
  type: EvidenceType;
  sourceKind: EvidenceSourceKind;
  summary: string;
  excerpt: string;
  url: string;
  domain: string;
  credibility: EvidenceCredibility;
  retrievalStatus: EvidenceRetrievalStatus;
  usedBy: string;
}

export interface DebateMessage {
  id: string;
  speakerId: string;
  speaker: string;
  role: AgentRole;
  turn: number;
  content: string;
}

export interface SessionSettings {
  enableSearch: boolean;
  selectedModel?: string;
  maxActiveEvidence?: number;
  juryEnabled?: boolean;
}

export interface JurorResult {
  jurorModel: string;
  winner: string;
  reasoning: string;
  confidence: number;
}

export interface JuryRound {
  id: string;
  createdAt: string;
  consensusWinner: string;
  consensusSummary: string;
  jurors: JurorResult[];
}

export interface JudgeReport {
  id: string;
  createdAt: string;
  factCheckSummary: string;
  strongestSupportedClaim: string;
  weakestSupportedClaim: string;
  missingEvidence: string;
  provisionalVerdict: string;
}

export interface PostmortemScorecard {
  coherence: number;
  evidenceUse: number;
  responsiveness: number;
  fairness: number;
  originality: number;
}

export interface PostmortemReport {
  id: string;
  createdAt: string;
  summary: string;
  bestArgumentByAgent: string;
  unsupportedClaims: string;
  missedQuestions: string;
  scorecard: PostmortemScorecard;
  nextPrompts: string;
}

export interface SessionAnalysis {
  juryRounds: JuryRound[];
  judgeReports: JudgeReport[];
  postmortems: PostmortemReport[];
}

export interface SessionModeState {
  completedAiTurns: number;
  stanceShiftActive?: boolean;
  stanceShiftApplied?: boolean;
  switchedAgentIds?: string[];
  lastAnalysisType?: "jury" | "judge" | "postmortem";
}

export interface DebateSession {
  id: string;
  title: string;
  topic: string;
  framing: string;
  createdAt: string;
  updatedAt: string;
  mode: DebateMode;
  agents: AgentProfile[];
  messages: DebateMessage[];
  evidence: EvidenceCard[];
  removedEvidence: EvidenceCard[];
  messageEvidenceMap: Record<string, string[]>;
  analysis: SessionAnalysis;
  modeState: SessionModeState;
  settings: SessionSettings;
}

export interface SessionSummary {
  id: string;
  title: string;
  topic: string;
  mode: DebateMode;
  updatedAt: string;
  createdAt: string;
  participantCount: number;
}

export interface CreateSessionInput {
  topic: string;
  framing: string;
  mode: DebateMode;
  agentIds: string[];
  enableSearch?: boolean;
  title?: string;
}

export interface DebateResponse {
  nextSpeakerId?: string;
  moderatorInstruction?: string;
  draftMessage?: DebateMessage;
  suggestedEvidence: EvidenceCard[];
  evidenceUsed: string[];
  error?: string;
  attemptedModels?: string[];
}

export interface DebateActionRequest {
  sessionId: string;
  session: DebateSession;
  userMessage?: string;
  requestedAction?: "send_turn" | "run_judge" | "run_postmortem";
}
