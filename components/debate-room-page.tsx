"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EvidenceSourceCard } from "@/components/evidence-card";
import { MessageCard } from "@/components/message-card";
import { defaultAgents } from "@/data/agents";
import { debateModeMeta, deleteSession, duplicateSession, getSession, updateSession } from "@/lib/session-store";
import type { DebateActionRequest, DebateMessage, DebateSession, EvidenceCard, JudgeReport, JuryRound, PostmortemReport } from "@/types/debate";

interface DebateRoomPageProps {
  sessionId: string;
}

type EvidenceFilter = "used" | "active" | "removed";
type SidebarPanel = "evidence" | "analysis";

type StreamEvent =
  | { type: "status"; status: string }
  | { type: "evidence"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean }
  | { type: "message_start"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string }
  | { type: "message_delta"; delta: string }
  | { type: "message_done"; draftMessage: DebateMessage; evidenceUsed: string[]; provider?: string; model?: string; attemptedModels?: string[] }
  | { type: "analysis_start"; analysisType: "jury" | "judge" | "postmortem"; status: string }
  | { type: "analysis_result"; analysisType: "jury" | "judge" | "postmortem"; result: JuryRound | JudgeReport | PostmortemReport }
  | { type: "session_meta"; title: string; mode: DebateSession["mode"]; updatedAt: string }
  | { type: "mode_state"; modeState: DebateSession["modeState"] }
  | { type: "done"; suggestedEvidence: EvidenceCard[]; usedLiveSearch: boolean; attemptedModels?: string[] }
  | { type: "error"; error: string; attemptedModels?: string[]; suggestedEvidence: EvidenceCard[]; provider?: string; model?: string };

const MOBILE_WIDTH_QUERY = "(max-width: 980px)";
const DEFAULT_INPUT = "Ask the room a question, push on a weak claim, or paste links for grounded rebuttals.";

function mergeEvidenceCards(current: EvidenceCard[], incoming: EvidenceCard[]): EvidenceCard[] {
  const merged = new Map<string, EvidenceCard>();

  for (const item of [...current, ...incoming]) {
    merged.set(item.url, item);
  }

  return Array.from(merged.values());
}

function buildRecentUseRank(messages: DebateMessage[], messageEvidenceMap: Record<string, string[]>): Map<string, number> {
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

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/\S+/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.replace(/[),.;]+$/, ""))));
}

export default function DebateRoomPage({ sessionId }: DebateRoomPageProps) {
  const router = useRouter();
  const [session, setSession] = useState<DebateSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Loading session...");
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("used");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SidebarPanel>("evidence");

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loaded = getSession(sessionId);
    setSession(loaded);
    setStatus(loaded ? "Ready. Continue the debate or trigger analysis." : "This session could not be found.");
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_WIDTH_QUERY);
    const applyMatch = () => setIsMobileViewport(mediaQuery.matches);
    applyMatch();
    mediaQuery.addEventListener("change", applyMatch);
    return () => mediaQuery.removeEventListener("change", applyMatch);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsEvidenceDrawerOpen(false);
    }
  }, [isMobileViewport]);

  const agentsById = useMemo(() => new Map(defaultAgents.map((agent) => [agent.id, agent])), []);
  const participants = useMemo(() => session?.agents.filter((agent) => agent.role !== "user") ?? [], [session]);
  const activeEvidenceById = useMemo(() => new Map((session?.evidence ?? []).map((item) => [item.id, item])), [session]);
  const latestAssistantMessageId = useMemo(() => [...(session?.messages ?? [])].reverse().find((message) => message.role !== "user")?.id ?? null, [session]);
  const detectedUrls = useMemo(() => extractUrls(input), [input]);

  const latestUsedEvidenceIds = useMemo(() => {
    if (!session) {
      return [] as string[];
    }

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const ids = session.messageEvidenceMap[session.messages[index].id] ?? [];
      if (ids.length > 0) {
        return ids;
      }
    }

    return [] as string[];
  }, [session]);

  const recentUseRank = useMemo(() => buildRecentUseRank(session?.messages ?? [], session?.messageEvidenceMap ?? {}), [session]);

  const sortedActiveEvidence = useMemo(() => {
    if (!session) {
      return [] as EvidenceCard[];
    }

    return [...session.evidence].sort((left, right) => {
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
  }, [latestUsedEvidenceIds, recentUseRank, selectedEvidenceId, session]);

  const filteredEvidence = useMemo(() => {
    if (!session) {
      return [] as EvidenceCard[];
    }

    if (evidenceFilter === "removed") {
      return session.removedEvidence;
    }

    if (evidenceFilter === "used") {
      return sortedActiveEvidence.filter((item) => latestUsedEvidenceIds.includes(item.id));
    }

    return sortedActiveEvidence;
  }, [evidenceFilter, latestUsedEvidenceIds, session, sortedActiveEvidence]);

  const latestJury = session?.analysis.juryRounds.at(-1);
  const latestJudge = session?.analysis.judgeReports.at(-1);
  const latestPostmortem = session?.analysis.postmortems.at(-1);
  const showAnalysisPanel = session ? session.mode !== "classic" || session.analysis.juryRounds.length > 0 || session.analysis.judgeReports.length > 0 || session.analysis.postmortems.length > 0 : false;

  function commitSession(recipe: (current: DebateSession) => DebateSession, persist = true) {
    setSession((current) => {
      if (!current) {
        return current;
      }

      const next = recipe(current);
      return persist ? updateSession(next) : next;
    });
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }

  function handleMessageScroll() {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const atBottom = distanceFromBottom < 48;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowJumpToLatest(false);
    }
  }

  useEffect(() => {
    if (isAtBottom) {
      scrollToLatest(streamingMessageId ? "auto" : "smooth");
      return;
    }

    if (streamingMessageId || loading) {
      setShowJumpToLatest(true);
    }
  }, [isAtBottom, loading, session?.messages, streamingMessageId]);

  async function runAction(requestedAction: DebateActionRequest["requestedAction"], userMessage?: string) {
    if (!session) {
      return;
    }

    const response = await fetch("/api/debate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        session,
        userMessage,
        requestedAction
      } satisfies DebateActionRequest)
    });

    if (!response.ok || !response.body) {
      throw new Error("The server did not return a readable stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const event = JSON.parse(line) as StreamEvent;
        switch (event.type) {
          case "status": {
            setStatus(event.status);
            break;
          }
          case "evidence": {
            commitSession((current) => ({ ...current, evidence: mergeEvidenceCards(current.evidence, event.suggestedEvidence) }));
            break;
          }
          case "message_start": {
            streamingMessageIdRef.current = event.draftMessage.id;
            setStreamingMessageId(event.draftMessage.id);
            commitSession((current) => ({ ...current, messages: [...current.messages, event.draftMessage] }), false);
            break;
          }
          case "message_delta": {
            const currentStreamingId = streamingMessageIdRef.current;
            if (!currentStreamingId) {
              break;
            }
            commitSession(
              (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === currentStreamingId
                    ? {
                        ...message,
                        content: `${message.content}${event.delta}`
                      }
                    : message
                )
              }),
              false
            );
            break;
          }
          case "message_done": {
            streamingMessageIdRef.current = null;
            setStreamingMessageId(null);
            commitSession((current) => ({
              ...current,
              messages: current.messages.map((message) => (message.id === event.draftMessage.id ? event.draftMessage : message)),
              messageEvidenceMap: {
                ...current.messageEvidenceMap,
                [event.draftMessage.id]: event.evidenceUsed ?? []
              }
            }));
            setSelectedEvidenceId(event.evidenceUsed?.[0] ?? null);
            setEvidenceFilter((event.evidenceUsed?.length ?? 0) > 0 ? "used" : "active");
            setStatus(`Reply from ${event.draftMessage.speaker}. Provider: ${event.provider ?? "unknown"}. Model: ${event.model ?? "unknown"}.`);
            break;
          }
          case "analysis_start": {
            setActiveSidebarPanel("analysis");
            setStatus(event.status);
            break;
          }
          case "analysis_result": {
            setActiveSidebarPanel("analysis");
            commitSession((current) => {
              if (event.analysisType === "jury") {
                return {
                  ...current,
                  analysis: {
                    ...current.analysis,
                    juryRounds: [...current.analysis.juryRounds, event.result as JuryRound]
                  }
                };
              }

              if (event.analysisType === "judge") {
                return {
                  ...current,
                  analysis: {
                    ...current.analysis,
                    judgeReports: [...current.analysis.judgeReports, event.result as JudgeReport]
                  }
                };
              }

              return {
                ...current,
                analysis: {
                  ...current.analysis,
                  postmortems: [...current.analysis.postmortems, event.result as PostmortemReport]
                }
              };
            });
            break;
          }
          case "session_meta": {
            commitSession((current) => ({ ...current, title: event.title, mode: event.mode, updatedAt: event.updatedAt }));
            break;
          }
          case "mode_state": {
            commitSession((current) => ({ ...current, modeState: event.modeState }));
            break;
          }
          case "done": {
            commitSession((current) => ({ ...current, evidence: mergeEvidenceCards(current.evidence, event.suggestedEvidence) }));
            setLoading(false);
            break;
          }
          case "error": {
            streamingMessageIdRef.current = null;
            setStreamingMessageId(null);
            setLoading(false);
            commitSession((current) => ({ ...current, evidence: mergeEvidenceCards(current.evidence, event.suggestedEvidence) }));
            const attempted = event.attemptedModels?.length ? ` Tried: ${event.attemptedModels.join(", ")}.` : "";
            setStatus(`${event.error}${attempted}`);
            break;
          }
        }
      }
    }
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading || !session) {
      return;
    }

    const optimisticUserMessage: DebateMessage = {
      id: `local-user-${session.messages.length + 1}`,
      speakerId: "user",
      speaker: "You",
      role: "user",
      turn: session.messages.length + 1,
      content: trimmed
    };

    commitSession((current) => ({ ...current, messages: [...current.messages, optimisticUserMessage] }));
    setLoading(true);
    setStatus(session.settings.enableSearch ? "Searching and grounding sources..." : "Thinking with the current evidence set...");
    setInput("");
    setShowJumpToLatest(false);

    try {
      await runAction("send_turn", trimmed);
    } catch (error) {
      streamingMessageIdRef.current = null;
      setStreamingMessageId(null);
      setLoading(false);
      setStatus(error instanceof Error ? error.message : "Request failed.");
    }
  }

  async function handleJudge() {
    if (!session || loading) {
      return;
    }

    setLoading(true);
    try {
      await runAction("run_judge");
    } catch (error) {
      setLoading(false);
      setStatus(error instanceof Error ? error.message : "Judge request failed.");
    }
  }

  async function handlePostmortem() {
    if (!session || loading) {
      return;
    }

    setLoading(true);
    try {
      await runAction("run_postmortem");
    } catch (error) {
      setLoading(false);
      setStatus(error instanceof Error ? error.message : "Postmortem request failed.");
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleSelectEvidence(evidenceId: string) {
    setActiveSidebarPanel("evidence");
    setSelectedEvidenceId(evidenceId);
    if (evidenceFilter === "removed") {
      setEvidenceFilter("active");
    }
    if (isMobileViewport) {
      setIsEvidenceDrawerOpen(true);
    }
  }

  function handleRemoveEvidence(evidenceId: string) {
    commitSession((current) => {
      const target = current.evidence.find((item) => item.id === evidenceId);
      if (!target) {
        return current;
      }
      return {
        ...current,
        evidence: current.evidence.filter((item) => item.id !== evidenceId),
        removedEvidence: [target, ...current.removedEvidence.filter((item) => item.id !== evidenceId)]
      };
    });
    if (selectedEvidenceId === evidenceId) {
      setSelectedEvidenceId(null);
    }
    setStatus("Source removed from the active debate context.");
  }

  function handleUndoRemove() {
    if (!session) {
      return;
    }
    const [latest, ...rest] = session.removedEvidence;
    if (!latest) {
      return;
    }
    commitSession((current) => ({
      ...current,
      removedEvidence: rest,
      evidence: mergeEvidenceCards([latest], current.evidence)
    }));
    setEvidenceFilter("active");
    setSelectedEvidenceId(latest.id);
    setStatus("Restored the most recently removed source.");
  }

  function handleResetConversation() {
    if (!session) {
      return;
    }
    const opening = session.messages.find((message) => message.speakerId === "moderator") ?? session.messages[0];
    commitSession((current) => ({
      ...current,
      messages: opening ? [{ ...opening, turn: 1 }] : [],
      evidence: [],
      removedEvidence: [],
      messageEvidenceMap: {},
      analysis: {
        juryRounds: [],
        judgeReports: [],
        postmortems: []
      },
      modeState: {
        ...current.modeState,
        completedAiTurns: opening ? 1 : 0,
        stanceShiftActive: false,
        stanceShiftApplied: false
      }
    }));
    setSelectedEvidenceId(null);
    setEvidenceFilter("used");
    setActiveSidebarPanel("evidence");
    setStatus("Conversation reset for this session.");
  }

  function handleDuplicateSession() {
    const copy = duplicateSession(sessionId);
    if (copy) {
      router.push(`/debate/${copy.id}`);
    }
  }

  function handleDeleteSession() {
    deleteSession(sessionId);
    router.push("/");
  }

  if (!session) {
    return (
      <main className="page-pad">
        <div className="shell stack">
          <section className="hero-card">
            <span className="eyebrow">Missing Session</span>
            <h1 className="hero-title">This debate session no longer exists.</h1>
            <p className="lede">Go back to the workspace to create a new room or reopen another session.</p>
            <div className="cta-row">
              <Link href="/" className="cta">
                Back to workspace
              </Link>
              <Link href="/debate/new" className="ghost">
                New debate
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="debate-app">
      <div className="debate-shell-v2">
        <section className="debate-topbar">
          <div>
            <span className="eyebrow">{debateModeMeta[session.mode].label}</span>
            <h1 className="debate-title-v2">{session.title}</h1>
            <p className="debate-subtitle-v2">{session.framing}</p>
          </div>
          <div className="participant-row-v2">
            {participants.map((agent) => (
              <span key={agent.id} className="participant-chip-v2" style={{ borderColor: `${agent.color}33`, color: agent.color }}>
                {agent.name} · {agent.lens}
              </span>
            ))}
            {session.modeState.stanceShiftActive ? <span className="participant-chip-v2 status-chip-v2">Stance Shift Active</span> : null}
          </div>
          <div className="topbar-actions-v2">
            <Link href="/" className="ghost ghost-v2">
              Workspace
            </Link>
            {session.mode === "networked_judge" ? (
              <button className="ghost ghost-v2" type="button" onClick={handleJudge} disabled={loading}>
                Ask Judge
              </button>
            ) : null}
            {session.mode === "postmortem" ? (
              <button className="ghost ghost-v2" type="button" onClick={handlePostmortem} disabled={loading}>
                End Debate
              </button>
            ) : null}
            <button className="ghost ghost-v2" type="button" onClick={handleDuplicateSession}>
              Duplicate
            </button>
            <button className="ghost ghost-v2" type="button" onClick={handleResetConversation}>
              Reset conversation
            </button>
            <button className="ghost ghost-v2 danger-ghost-v2" type="button" onClick={handleDeleteSession}>
              Delete
            </button>
            <button className="ghost ghost-v2 evidence-toggle-v2" type="button" onClick={() => setIsEvidenceDrawerOpen((current) => !current)}>
              {activeSidebarPanel === "analysis" ? "Analysis" : "Evidence"}
            </button>
          </div>
        </section>

        <section className="debate-layout-v3">
          <section className="conversation-panel-v2">
            <div className={`status-bar-v2${loading ? " live" : ""}`}>{status}</div>
            <div className="message-viewport-v2" ref={messageViewportRef} onScroll={handleMessageScroll}>
              <div className="message-list-v2">
                {session.messages.map((message) => {
                  const agent = agentsById.get(message.speakerId);
                  const isFocused = message.id === streamingMessageId || (!loading && message.id === latestAssistantMessageId);
                  return (
                    <MessageCard
                      key={message.id}
                      message={message}
                      agent={agent}
                      citedEvidence={(session.messageEvidenceMap[message.id] ?? []).map((id) => activeEvidenceById.get(id)).filter(Boolean) as EvidenceCard[]}
                      onEvidenceClick={handleSelectEvidence}
                      selectedEvidenceId={selectedEvidenceId}
                      isStreaming={message.id === streamingMessageId}
                      isFocused={isFocused}
                    />
                  );
                })}
              </div>
            </div>
            {showJumpToLatest ? (
              <button className="jump-to-latest-v2" type="button" onClick={() => scrollToLatest("smooth")}>
                New reply below · Jump to latest
              </button>
            ) : null}
            <div className="composer-v2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask the room a question, paste article/PDF links, and press Ctrl+Enter to send."
              />
              <div className="composer-toolbar-v2">
                <label className={`toggle-pill-v2${session.settings.enableSearch ? " active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={session.settings.enableSearch}
                    onChange={(event) => commitSession((current) => ({ ...current, settings: { ...current.settings, enableSearch: event.target.checked } }))}
                  />
                  <span>Web search</span>
                </label>
                <span className="composer-hint-v2">{debateModeMeta[session.mode].description}</span>
                <button className="cta cta-v2" type="button" onClick={handleSend} disabled={loading}>
                  {loading ? "Working..." : "Send"}
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

          <aside className={`side-stack-v2${showAnalysisPanel ? " has-analysis" : ""}`}>
            {isMobileViewport && isEvidenceDrawerOpen ? <button className="drawer-scrim-v2" type="button" aria-label="Close sidebar drawer" onClick={() => setIsEvidenceDrawerOpen(false)} /> : null}
            <div className="sidebar-tabs-v2">
              <button className={`tab-v2${activeSidebarPanel === "evidence" ? " active" : ""}`} type="button" onClick={() => setActiveSidebarPanel("evidence")}>
                Evidence
              </button>
              {showAnalysisPanel ? (
                <button className={`tab-v2${activeSidebarPanel === "analysis" ? " active" : ""}`} type="button" onClick={() => setActiveSidebarPanel("analysis")}>
                  Analysis
                </button>
              ) : null}
            </div>

            <aside className={`evidence-rail-v2${isMobileViewport ? " mobile" : ""}${isEvidenceDrawerOpen ? " open" : ""}${activeSidebarPanel === "evidence" ? " visible" : " hidden"}`}>
              <div className="evidence-rail-header-v2">
                <div>
                  <h2>Evidence</h2>
                  <span>{session.evidence.length} active</span>
                </div>
                {session.removedEvidence.length > 0 ? (
                  <button className="ghost ghost-v2" type="button" onClick={handleUndoRemove}>
                    Undo remove
                  </button>
                ) : null}
              </div>
              <p className="evidence-note-v2">Inspect, prune, and validate the sources feeding the current turn and any judge output.</p>
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

            {showAnalysisPanel ? (
              <section className={`analysis-rail-v2${activeSidebarPanel === "analysis" ? " visible" : " hidden"}`}>
                <div className="analysis-head-v2">
                  <div>
                    <h2>Analysis</h2>
                    <span>Mode-aware outputs</span>
                  </div>
                </div>
                <div className="analysis-scroll-v2">
                  {latestJury ? (
                    <article className="analysis-card-v2">
                      <strong>Latest Jury Round</strong>
                      <p><strong>Winner:</strong> {latestJury.consensusWinner}</p>
                      <p>{latestJury.consensusSummary}</p>
                      <div className="analysis-list-v2">
                        {latestJury.jurors.map((juror) => (
                          <div key={`${latestJury.id}-${juror.jurorModel}`} className="analysis-item-v2">
                            <strong>{juror.jurorModel}</strong>
                            <span>{juror.winner} · confidence {juror.confidence}/100</span>
                            <p>{juror.reasoning}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {latestJudge ? (
                    <article className="analysis-card-v2">
                      <strong>Latest Judge Report</strong>
                      <p><strong>Fact check:</strong> {latestJudge.factCheckSummary}</p>
                      <p><strong>Strongest supported claim:</strong> {latestJudge.strongestSupportedClaim}</p>
                      <p><strong>Weakest supported claim:</strong> {latestJudge.weakestSupportedClaim}</p>
                      <p><strong>Missing evidence:</strong> {latestJudge.missingEvidence}</p>
                      <p><strong>Verdict:</strong> {latestJudge.provisionalVerdict}</p>
                    </article>
                  ) : null}

                  {latestPostmortem ? (
                    <article className="analysis-card-v2">
                      <strong>Latest Postmortem</strong>
                      <p>{latestPostmortem.summary}</p>
                      <p><strong>Best argument:</strong> {latestPostmortem.bestArgumentByAgent}</p>
                      <p><strong>Unsupported claims:</strong> {latestPostmortem.unsupportedClaims}</p>
                      <p><strong>Missed questions:</strong> {latestPostmortem.missedQuestions}</p>
                      <div className="score-grid-v2">
                        <span>Coherence {latestPostmortem.scorecard.coherence}/10</span>
                        <span>Evidence {latestPostmortem.scorecard.evidenceUse}/10</span>
                        <span>Response {latestPostmortem.scorecard.responsiveness}/10</span>
                        <span>Fairness {latestPostmortem.scorecard.fairness}/10</span>
                        <span>Originality {latestPostmortem.scorecard.originality}/10</span>
                      </div>
                      <p><strong>Next prompts:</strong> {latestPostmortem.nextPrompts}</p>
                    </article>
                  ) : null}

                  {!latestJury && !latestJudge && !latestPostmortem ? (
                    <div className="empty-analysis-v2">
                      <strong>No analysis yet.</strong>
                      <p>This panel will populate when the current mode emits jury, judge, or postmortem results.</p>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
