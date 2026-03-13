"use client";

import { useState } from "react";
import { AgentCard } from "@/components/agent-card";
import { EvidenceSourceCard } from "@/components/evidence-card";
import { MessageCard } from "@/components/message-card";
import { sampleSession } from "@/data/sample-session";
import type { DebateMessage, EvidenceCard } from "@/types/debate";

interface DebateApiResponse {
  nextSpeakerId: string;
  moderatorInstruction: string;
  draftMessage: DebateMessage;
  suggestedEvidence: EvidenceCard[];
  model?: string;
  usedLiveModel?: boolean;
  usedLiveSearch?: boolean;
  error?: string;
}

export default function DebatePage() {
  const [topic] = useState(sampleSession.topic);
  const [messages, setMessages] = useState<DebateMessage[]>(sampleSession.messages);
  const [evidence, setEvidence] = useState<EvidenceCard[]>(sampleSession.evidence);
  const [input, setInput] = useState(
    "What if autonomous systems are only allowed in defensive settings where human delay clearly increases civilian harm?"
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to send a live turn.");

  async function handleSend() {
    const trimmed = input.trim();

    if (!trimmed || loading) {
      return;
    }

    const userMessage: DebateMessage = {
      id: `local-user-${messages.length + 1}`,
      speakerId: "user",
      speaker: "You",
      role: "user",
      turn: messages.length + 1,
      content: trimmed
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setLoading(true);
    setStatus("Generating the next debate turn...");

    try {
      const response = await fetch("/api/debate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topic,
          userMessage: trimmed,
          history: messages,
          evidence
        })
      });

      const payload = (await response.json()) as DebateApiResponse;
      setMessages((current) => [...current, payload.draftMessage]);
      if (payload.suggestedEvidence?.length) {
        setEvidence(payload.suggestedEvidence);
      }

      if (payload.error) {
        setStatus(`Fallback response used: ${payload.error}`);
      } else {
        setStatus(
          `Reply from ${payload.draftMessage.speaker} | model: ${payload.model ?? "unknown"} | live search: ${payload.usedLiveSearch ? "yes" : "no"}`
        );
      }

      setInput("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-pad">
      <div className="shell stack">
        <section className="hero-card">
          <span className="eyebrow">Live Room</span>
          <h1 className="hero-title" style={{ fontSize: "clamp(1.9rem, 3.8vw, 3rem)" }}>
            {sampleSession.topic}
          </h1>
          <p className="lede">{sampleSession.framing}</p>
          <div className="mini-actions">
            <span>{status}</span>
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
              {messages.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}
            </div>
            <div className="composer">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} />
              <div className="composer-actions">
                <span className="hint">This room now calls the live backend route instead of staying static.</span>
                <button className="cta" type="button" onClick={handleSend} disabled={loading}>
                  {loading ? "Thinking..." : "Send to room"}
                </button>
              </div>
            </div>
          </section>

          <aside className="panel">
            <h2 className="sidebar-title">Evidence Panel</h2>
            <div className="source-list">
              {evidence.map((item) => (
                <EvidenceSourceCard key={item.id} evidence={item} />
              ))}
            </div>
          </aside>
        </section>

        <section className="api-box">
          <strong>Live behavior</strong>
          <pre>{`The page now sends your message to /api/debate.
The route can use OpenAI for the next speaker reply.
If SEARCH_API_KEY works, the evidence panel is refreshed with live search results.`}</pre>
        </section>
      </div>
    </main>
  );
}
