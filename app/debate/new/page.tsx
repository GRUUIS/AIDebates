"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { defaultAgents } from "@/data/agents";
import { createSession, debateModeMeta } from "@/lib/session-store";
import type { DebateMode } from "@/types/debate";

const defaultAgentIds = ["moderator", "utilitarian", "deontologist", "virtue"];

export default function NewDebatePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [framing, setFraming] = useState("");
  const [mode, setMode] = useState<DebateMode>("classic");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(defaultAgentIds);
  const [enableSearch, setEnableSearch] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debaterCount = useMemo(() => defaultAgents.filter((agent) => selectedAgentIds.includes(agent.id) && agent.role === "debater").length, [selectedAgentIds]);

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) => (current.includes(agentId) ? current.filter((item) => item !== agentId) : [...current, agentId]));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topic.trim() || !framing.trim()) {
      setError("Topic and framing are both required.");
      return;
    }
    if (debaterCount < 1) {
      setError("Pick at least one debater. The system will auto-include a moderator if needed.");
      return;
    }

    const session = createSession({
      topic,
      framing,
      mode,
      agentIds: selectedAgentIds,
      enableSearch
    });
    router.push(`/debate/${session.id}`);
  }

  return (
    <main className="page-pad">
      <div className="shell stack">
        <section className="hero-card">
          <span className="eyebrow">New Debate</span>
          <h1 className="hero-title">Create a new session</h1>
          <p className="lede">Define the topic, add a framing statement, choose a mode, and decide which built-in voices will participate.</p>
        </section>

        <form className="panel form-panel-v2" onSubmit={handleSubmit}>
          <label className="field-v2">
            <span>Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Should frontier AI labs pause open-weight releases?" />
          </label>

          <label className="field-v2">
            <span>Framing</span>
            <textarea
              value={framing}
              onChange={(event) => setFraming(event.target.value)}
              rows={5}
              placeholder="Summarize the key ethical tension, tradeoffs, and stakes you want the room to debate."
            />
          </label>

          <div className="field-v2">
            <span>Debate mode</span>
            <div className="mode-grid-v2">
              {(Object.entries(debateModeMeta) as Array<[DebateMode, { label: string; description: string }]>) .map(([value, meta]) => (
                <label key={value} className={`mode-card-v2${mode === value ? " active" : ""}`}>
                  <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} />
                  <strong>{meta.label}</strong>
                  <p>{meta.description}</p>
                </label>
              ))}
            </div>
          </div>

          <div className="field-v2">
            <span>Participants</span>
            <div className="agent-picker-v2">
              {defaultAgents.map((agent) => (
                <label key={agent.id} className={`agent-option-v2${selectedAgentIds.includes(agent.id) ? " active" : ""}`}>
                  <input type="checkbox" checked={selectedAgentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} />
                  <strong>{agent.name}</strong>
                  <span>{agent.lens}</span>
                </label>
              ))}
            </div>
            <small className="helper-v2">At least one debater is required. The moderator will be auto-added if omitted.</small>
          </div>

          <label className="toggle-row-v2">
            <input type="checkbox" checked={enableSearch} onChange={(event) => setEnableSearch(event.target.checked)} />
            <span>Enable web search by default</span>
          </label>

          {error ? <div className="error-box-v2">{error}</div> : null}

          <div className="cta-row">
            <button className="cta" type="submit">
              Create session
            </button>
            <Link href="/" className="ghost">
              Back to workspace
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
