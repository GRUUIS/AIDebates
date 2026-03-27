export type AgentRole = "moderator" | "debater" | "user";

export type MoralLens =
  | "Utilitarian"
  | "Deontological"
  | "Virtue Ethics"
  | "Policy Pragmatist"
  | "Moderator";

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

export interface DebateSession {
  topic: string;
  framing: string;
  agents: AgentProfile[];
  messages: DebateMessage[];
  evidence: EvidenceCard[];
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
