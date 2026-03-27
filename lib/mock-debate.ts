import type { DebateResponse, DebateSession } from "@/types/debate";

export function createMockDebateResponse(session: DebateSession): DebateResponse {
  return {
    suggestedEvidence: session.evidence,
    evidenceUsed: [],
    error: "No live model is configured for this environment."
  };
}
