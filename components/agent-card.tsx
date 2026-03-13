import type { AgentProfile } from "@/types/debate";

export function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <article className="agent-card">
      <div className="agent-meta">
        <strong>{agent.name}</strong>
        <span className="agent-role">{agent.lens}</span>
      </div>
      <p className="agent-style">{agent.stance}</p>
      <p className="agent-style">
        <strong>Style:</strong> {agent.style}
      </p>
    </article>
  );
}
