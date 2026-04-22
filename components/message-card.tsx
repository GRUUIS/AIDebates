import type { AgentProfile, DebateMessage, EvidenceCard } from "@/types/debate";

interface MessageCardProps {
  message: DebateMessage;
  agent?: AgentProfile;
  citedEvidence?: EvidenceCard[];
  onEvidenceClick?: (evidenceId: string) => void;
  selectedEvidenceId?: string | null;
  isStreaming?: boolean;
  isFocused?: boolean;
  replyTarget?: DebateMessage;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "?"
  );
}

export function MessageCard({
  message,
  agent,
  citedEvidence = [],
  onEvidenceClick,
  selectedEvidenceId,
  isStreaming,
  isFocused,
  replyTarget
}: MessageCardProps) {
  const accent = message.role === "user" ? "#0f172a" : agent?.color ?? "#0f766e";

  return (
    <article
      className={`message-v2${message.role === "user" ? " user" : ""}${isStreaming ? " streaming" : ""}${isFocused ? " focused" : ""}`}
      style={{ ["--message-accent" as string]: accent }}
    >
      <div className="message-head-v2">
        <div className="message-avatar-v2">{getInitials(message.speaker)}</div>
        <div className="message-meta-stack-v2">
          <div className="message-meta-v2">
            <strong>{message.speaker}</strong>
            <span className="message-tag-v2">
              Turn {message.turn} · {message.role}
            </span>
          </div>
          <div className="message-submeta-v2">
            {agent && message.role !== "user" ? <span className="message-lens-v2">{agent.lens}</span> : null}
            {message.intent ? <span className="message-intent-v2">{message.intent.replace(/_/g, " ")}</span> : null}
            {replyTarget ? <span className="message-reply-v2">Replying to {replyTarget.speaker}</span> : null}
          </div>
        </div>
      </div>
      <p className="message-text-v2">{message.content || (isStreaming ? " " : "")}</p>
      {isStreaming ? (
        <div className="typing-indicator-v2" aria-label="Streaming response">
          <span />
          <span />
          <span />
        </div>
      ) : null}
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
                title={evidence.title}
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

