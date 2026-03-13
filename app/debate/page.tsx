import { AgentCard } from "@/components/agent-card";
import { EvidenceSourceCard } from "@/components/evidence-card";
import { MessageCard } from "@/components/message-card";
import { sampleSession } from "@/data/sample-session";

export default function DebatePage() {
  return (
    <main className="page-pad">
      <div className="shell stack">
        <section className="hero-card">
          <span className="eyebrow">Prototype Room</span>
          <h1 className="hero-title" style={{ fontSize: "clamp(1.9rem, 3.8vw, 3rem)" }}>
            {sampleSession.topic}
          </h1>
          <p className="lede">{sampleSession.framing}</p>
          <div className="mini-actions">
            <span>Request evidence</span>
            <span>Force rebuttal</span>
            <span>Summarize room</span>
          </div>
        </section>

        <section className="debate-grid">
          <aside className="panel">
            <h2 className="sidebar-title">Participants</h2>
            <div className="agent-list">
              {sampleSession.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </aside>

          <section className="panel chat-panel">
            <h2 className="sidebar-title">Debate Timeline</h2>
            <div className="message-list">
              {sampleSession.messages.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}
            </div>
            <div className="composer">
              <textarea
                defaultValue="What if autonomous systems are only allowed in defensive settings where human delay clearly increases civilian harm?"
              />
              <div className="composer-actions">
                <span className="hint">Next step: connect this composer to `/api/debate`.</span>
                <button className="cta" type="button">
                  Send to room
                </button>
              </div>
            </div>
          </section>

          <aside className="panel">
            <h2 className="sidebar-title">Evidence Panel</h2>
            <div className="source-list">
              {sampleSession.evidence.map((item) => (
                <EvidenceSourceCard key={item.id} evidence={item} />
              ))}
            </div>
          </aside>
        </section>

        <section className="api-box">
          <strong>Mock API contract</strong>
          <pre>{`POST /api/debate
{
  "topic": "Should governments permit autonomous weapons?",
  "userMessage": "What if a human still authorizes the mission?",
  "history": [...]
}`}</pre>
        </section>
      </div>
    </main>
  );
}
