export type AgentRole = "moderator" | "debater" | "user";

export type MoralLens =
  | "Utilitarian"
  | "Deontological"
  | "Virtue Ethics"
  | "Policy Pragmatist"
  | "Moderator";

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
  type: "paper" | "article" | "case-study" | "video" | "image";
  summary: string;
  url: string;
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
  nextSpeakerId: string;
  moderatorInstruction: string;
  draftMessage: DebateMessage;
  suggestedEvidence: EvidenceCard[];
}
