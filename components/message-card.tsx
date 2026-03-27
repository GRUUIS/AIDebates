import type { DebateMessage, EvidenceCard } from "@/types/debate";

interface MessageCardProps {
  message: DebateMessage;
  citedEvidence?: EvidenceCard[];
  onEvidenceClick?: (evidenceId: string) => void;
  selectedEvidenceId?: string | null;
}

export function MessageCard({ message, citedEvidence = [], onEvidenceClick, selectedEvidenceId }: MessageCardProps) {
  return (
    <article className={`message-v2${message.role === "user" ? " user" : ""}`}>
      <div className="message-meta-v2">
        <strong>{message.speaker}</strong>
        <span className="message-tag-v2">
          Turn {message.turn} · {message.role}
        </span>
      </div>
      <p className="message-text-v2">{message.content}</p>
      {citedEvidence.length > 0 ? (
        <div className="message-sources-v2">
          <span className="message-sources-label-v2">Used sources</span>
          <div className="message-source-chips-v2">
            {citedEvidence.map((evidence) => (
              <button
                key={evidence.id}
                className={`message-source-chip-v2${selectedEvidenceId === evidence.id ? " active" : ""}`}
                type="button"
                onClick={() => onEvidenceClick?.(evidence.id)}
              >
                {evidence.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
