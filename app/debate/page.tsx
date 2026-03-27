"use client";

import { useMemo, useState } from "react";
import { EvidenceSourceCard } from "@/components/evidence-card";
import { MessageCard } from "@/components/message-card";
import { sampleSession } from "@/data/sample-session";
import type { DebateMessage, EvidenceCard } from "@/types/debate";

interface DebateApiResponse {
  nextSpeakerId?: string;
  moderatorInstruction?: string;
  draftMessage?: DebateMessage;
  suggestedEvidence: EvidenceCard[];
  evidenceUsed: string[];
  attemptedModels?: string[];
  model?: string;
  provider?: string;
  usedLiveModel?: boolean;
  usedLiveSearch?: boolean;
  error?: string;
}

type EvidenceFilter = "used" | "active" | "removed";
type MessageEvidenceMap = Record<string, string[]>;

function mergeEvidenceCards(current: EvidenceCard[], incoming: EvidenceCard[]): EvidenceCard[] {
  const merged = new Map<string, EvidenceCard>();

  for (const item of [...current, ...incoming]) {
    merged.set(item.url, item);
  }

  return Array.from(merged.values());
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/\S+/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.replace(/[),.;]+$/, ""))));
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(raw.startsWith("<!DOCTYPE") ? "The server returned an HTML error page instead of JSON." : raw.slice(0, 180) || "Unexpected non-JSON response.");
  }

  return JSON.parse(raw) as T;
}

function buildRecentUseRank(messages: DebateMessage[], messageEvidenceMap: MessageEvidenceMap): Map<string, number> {
  const rank = new Map<string, number>();
  let weight = messages.length;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const evidenceIds = messageEvidenceMap[message.id] ?? [];

    for (const evidenceId of evidenceIds) {
      if (!rank.has(evidenceId)) {
        rank.set(evidenceId, weight);
      }
    }

    weight -= 1;
  }

  return rank;
}

export default function DebatePage() {
  const [topic] = useState(sampleSession.topic);
  const [messages, setMessages] = useState<DebateMessage[]>(sampleSession.messages);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceCard[]>(sampleSession.evidence);
  const [removedEvidence, setRemovedEvidence] = useState<EvidenceCard[]>([]);
  const [messageEvidenceMap, setMessageEvidenceMap] = useState<MessageEvidenceMap>({});
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("used");
  const [input, setInput] = useState(
    "What if autonomous systems are only allowed in defensive settings where human delay clearly increases civilian harm? Paste article or PDF links here if you want them grounded in the debate."
  );
  const [loading, setLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [status, setStatus] = useState("Ready. Paste links in the message box or ask a question to start the debate.");

  const detectedUrls = useMemo(() => extractUrls(input), [input]);
  const participants = sampleSession.agents.filter((agent) => agent.role !== "user");
  const latestUsedEvidenceIds = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const ids = messageEvidenceMap[messages[index].id] ?? [];
      if (ids.length > 0) {
        return ids;
      }
    }
    return [] as string[];
  }, [messageEvidenceMap, messages]);

  const activeEvidenceById = useMemo(() => new Map(activeEvidence.map((item) => [item.id, item])), [activeEvidence]);
  const recentUseRank = useMemo(() => buildRecentUseRank(messages, messageEvidenceMap), [messageEvidenceMap, messages]);

  const sortedActiveEvidence = useMemo(() => {
    return [...activeEvidence].sort((left, right) => {
      const leftSelected = left.id === selectedEvidenceId ? 1 : 0;
      const rightSelected = right.id === selectedEvidenceId ? 1 : 0;
      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected;
      }

      const leftUsedThisTurn = latestUsedEvidenceIds.includes(left.id) ? 1 : 0;
      const rightUsedThisTurn = latestUsedEvidenceIds.includes(right.id) ? 1 : 0;
      if (leftUsedThisTurn !== rightUsedThisTurn) {
        return rightUsedThisTurn - leftUsedThisTurn;
      }

      const leftRecent = recentUseRank.get(left.id) ?? 0;
      const rightRecent = recentUseRank.get(right.id) ?? 0;
      if (leftRecent !== rightRecent) {
        return rightRecent - leftRecent;
      }

      return left.title.localeCompare(right.title);
    });
  }, [activeEvidence, latestUsedEvidenceIds, recentUseRank, selectedEvidenceId]);

  const filteredEvidence = useMemo(() => {
    if (evidenceFilter === "removed") {
      return removedEvidence;
    }

    if (evidenceFilter === "used") {
      return sortedActiveEvidence.filter((item) => latestUsedEvidenceIds.includes(item.id));
    }

    return sortedActiveEvidence;
  }, [evidenceFilter, latestUsedEvidenceIds, removedEvidence, sortedActiveEvidence]);

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
    setStatus("Grounding sources and generating the next turn...");

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
          evidence: activeEvidence,
          enableSearch: useWebSearch
        })
      });

      const payload = await readJsonOrThrow<DebateApiResponse>(response);

      if (payload.suggestedEvidence?.length) {
        setActiveEvidence((current) => mergeEvidenceCards(current, payload.suggestedEvidence));
      }

      if (payload.draftMessage) {
        setMessages((current) => [...current, payload.draftMessage!]);
        setMessageEvidenceMap((current) => ({
          ...current,
          [payload.draftMessage!.id]: payload.evidenceUsed ?? []
        }));
        setSelectedEvidenceId(payload.evidenceUsed?.[0] ?? null);
        setEvidenceFilter((payload.evidenceUsed?.length ?? 0) > 0 ? "used" : "active");
        setStatus(
          `Reply from ${payload.draftMessage.speaker}. Provider: ${payload.provider ?? "unknown"}. Model: ${payload.model ?? "unknown"}. Evidence used: ${payload.evidenceUsed?.length ?? 0}.`
        );
      } else {
        const attempted = payload.attemptedModels?.length ? ` Tried: ${payload.attemptedModels.join(", ")}.` : "";
        setStatus(`${payload.error ?? "No live reply could be generated."}${attempted}`);
      }

      setInput("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleSelectEvidence(evidenceId: string) {
    setSelectedEvidenceId(evidenceId);
    if (evidenceFilter === "removed") {
      setEvidenceFilter("active");
    }
  }

  function handleRemoveEvidence(evidenceId: string) {
    setActiveEvidence((current) => {
      const target = current.find((item) => item.id === evidenceId);
      if (!target) {
        return current;
      }
      setRemovedEvidence((removed) => [target, ...removed.filter((item) => item.id !== evidenceId)]);
      return current.filter((item) => item.id !== evidenceId);
    });

    if (selectedEvidenceId === evidenceId) {
      setSelectedEvidenceId(null);
    }

    setStatus("Source removed from the active debate context.");
  }

  function handleUndoRemove() {
    const [latest, ...rest] = removedEvidence;
    if (!latest) {
      return;
    }

    setRemovedEvidence(rest);
    setActiveEvidence((current) => mergeEvidenceCards([latest], current));
    setEvidenceFilter("active");
    setSelectedEvidenceId(latest.id);
    setStatus("Restored the most recently removed source.");
  }

  return (
    <main className="debate-app">
      <div className="debate-shell-v2">
        <section className="debate-topbar">
          <div>
            <span className="eyebrow">Grounded Debate</span>
            <h1 className="debate-title-v2">{topic}</h1>
            <p className="debate-subtitle-v2">{sampleSession.framing}</p>
          </div>
          <div className="participant-row-v2">
            {participants.map((agent) => (
              <span key={agent.id} className="participant-chip-v2" style={{ borderColor: `${agent.color}33`, color: agent.color }}>
                {agent.name} · {agent.lens}
              </span>
            ))}
          </div>
        </section>

        <section className="debate-layout-v2">
          <section className="conversation-panel-v2">
            <div className="status-bar-v2">{status}</div>
            <div className="message-list-v2">
              {messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  citedEvidence={(messageEvidenceMap[message.id] ?? []).map((id) => activeEvidenceById.get(id)).filter(Boolean) as EvidenceCard[]}
                  onEvidenceClick={handleSelectEvidence}
                  selectedEvidenceId={selectedEvidenceId}
                />
              ))}
            </div>
            <div className="composer-v2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask the room a question, paste article/PDF links, and press Ctrl+Enter to send."
              />
              <div className="composer-toolbar-v2">
                <label className={`toggle-pill-v2${useWebSearch ? " active" : ""}`}>
                  <input type="checkbox" checked={useWebSearch} onChange={(event) => setUseWebSearch(event.target.checked)} />
                  <span>Web search</span>
                </label>
                <span className="composer-hint-v2">Links pasted here will be imported automatically. Evidence used in the latest reply is highlighted on the right.</span>
                <button className="cta cta-v2" type="button" onClick={handleSend} disabled={loading}>
                  {loading ? "Thinking..." : "Send"}
                </button>
              </div>
              {detectedUrls.length > 0 ? (
                <div className="detected-links-v2">
                  {detectedUrls.map((url) => (
                    <span key={url} className="link-chip-v2">
                      {url}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="evidence-rail-v2">
            <div className="evidence-rail-header-v2">
              <div>
                <h2>Evidence</h2>
                <span>{activeEvidence.length} active</span>
              </div>
              {removedEvidence.length > 0 ? (
                <button className="ghost ghost-v2" type="button" onClick={handleUndoRemove}>
                  Undo remove
                </button>
              ) : null}
            </div>
            <p className="evidence-note-v2">Keep the chat primary. Use the rail to inspect, prune, and validate the sources feeding the current turn.</p>
            <div className="evidence-tabs-v2">
              <button className={`tab-v2${evidenceFilter === "used" ? " active" : ""}`} type="button" onClick={() => setEvidenceFilter("used")}>
                Used this turn
              </button>
              <button className={`tab-v2${evidenceFilter === "active" ? " active" : ""}`} type="button" onClick={() => setEvidenceFilter("active")}>
                All active
              </button>
              <button className={`tab-v2${evidenceFilter === "removed" ? " active" : ""}`} type="button" onClick={() => setEvidenceFilter("removed")}>
                Removed
              </button>
            </div>
            <div className="source-list-v2">
              {filteredEvidence.length > 0 ? (
                filteredEvidence.map((item) => (
                  <EvidenceSourceCard
                    key={`${evidenceFilter}-${item.url}`}
                    evidence={item}
                    isHighlighted={item.id === selectedEvidenceId}
                    isUsedThisTurn={latestUsedEvidenceIds.includes(item.id)}
                    onSelect={handleSelectEvidence}
                    onRemove={evidenceFilter === "removed" ? undefined : handleRemoveEvidence}
                  />
                ))
              ) : (
                <div className="empty-evidence-v2">
                  <strong>{evidenceFilter === "used" ? "No evidence was cited in the latest turn" : evidenceFilter === "removed" ? "No removed sources" : "No evidence yet"}</strong>
                  <p>
                    {evidenceFilter === "used"
                      ? "When the model grounds a reply in active sources, they will appear here first."
                      : evidenceFilter === "removed"
                        ? "Removed sources stay here temporarily so you can undo mistakes."
                        : "Paste a webpage or PDF URL into the message box, or leave Web search on and ask a researchable question."}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
