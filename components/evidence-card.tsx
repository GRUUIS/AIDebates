import type { EvidenceCard } from "@/types/debate";

interface EvidenceSourceCardProps {
  evidence: EvidenceCard;
  isHighlighted?: boolean;
  isUsedThisTurn?: boolean;
  onSelect?: (evidenceId: string) => void;
  onRemove?: (evidenceId: string) => void;
}

export function EvidenceSourceCard({ evidence, isHighlighted, isUsedThisTurn, onSelect, onRemove }: EvidenceSourceCardProps) {
  return (
    <article className={`source-card-v2${isHighlighted ? " highlighted" : ""}${isUsedThisTurn ? " used" : ""}`}>
      <div className="source-meta-v2">
        <strong>{evidence.title}</strong>
        <div className="source-meta-actions-v2">
          {isUsedThisTurn ? <span className="source-flag-v2">Used</span> : null}
          <span className={`source-status-v2 ${evidence.retrievalStatus}`}>{evidence.retrievalStatus}</span>
        </div>
      </div>
      <div className="source-badges-v2">
        <span>{evidence.type}</span>
        <span>{evidence.sourceKind}</span>
        <span>{evidence.credibility}</span>
      </div>
      <p className="source-note-v2">{evidence.summary}</p>
      <p className="source-domain-v2">{evidence.domain}</p>
      <div className="source-actions-v2">
        <button className="link-button-v2" type="button" onClick={() => onSelect?.(evidence.id)}>
          Focus
        </button>
        {onRemove ? (
          <button className="link-button-v2 danger" type="button" onClick={() => onRemove(evidence.id)}>
            Remove
          </button>
        ) : null}
        <a href={evidence.url} target="_blank" rel="noreferrer">
          Open source
        </a>
      </div>
    </article>
  );
}
