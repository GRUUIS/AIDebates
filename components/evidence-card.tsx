import type { EvidenceCard } from "@/types/debate";

export function EvidenceSourceCard({ evidence }: { evidence: EvidenceCard }) {
  return (
    <article className="source-card">
      <div className="source-meta">
        <strong>{evidence.title}</strong>
        <span className="source-tag">{evidence.type}</span>
      </div>
      <p className="source-note">{evidence.summary}</p>
      <p className="source-note">Used by: {evidence.usedBy}</p>
      <a href={evidence.url} target="_blank" rel="noreferrer">
        Open source
      </a>
    </article>
  );
}
