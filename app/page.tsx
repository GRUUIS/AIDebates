"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeatureCard } from "@/components/feature-card";
import { createStarterSession, debateModeMeta, deleteSession, duplicateSession, ensureStarterSession, getSession, listSessions } from "@/lib/session-store";
import type { SessionSummary } from "@/types/debate";

const features = [
  {
    title: "Session Workspace",
    description: "Create separate debates with their own topic, framing, participants, evidence state, and analysis history."
  },
  {
    title: "Mode-Driven Orchestration",
    description: "Choose between Classic, Jury, Networked Judge, Stance Shift, and Postmortem modes when creating a room."
  },
  {
    title: "Local-First Persistence",
    description: "Keep multiple debates on-device with instant reload, duplication, and deletion without needing accounts yet."
  }
];

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    const starter = ensureStarterSession();
    setSessions(listSessions());
    if (!starter) {
      setSessions(listSessions());
    }
  }, []);

  function refresh() {
    setSessions(listSessions());
  }

  function handleCreateSample() {
    createStarterSession();
    refresh();
  }

  function handleDelete(sessionId: string) {
    deleteSession(sessionId);
    refresh();
  }

  function handleDuplicate(sessionId: string) {
    duplicateSession(sessionId);
    refresh();
  }

  function handleExport(sessionId: string) {
    const session = getSession(sessionId);
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page-pad">
      <div className="shell stack">
        <section className="hero-card">
          <span className="eyebrow">Ethics Arena</span>
          <div className="hero-grid">
            <div>
              <h1 className="hero-title">A workspace for AI debates, not just one fixed prototype room.</h1>
              <p className="lede">
                Create independent sessions with your own topic, framing, participant mix, and OpenRouter debate mode. Keep classic arguments, jury reviews, networked judging, and postmortems organized in one place.
              </p>
              <div className="pill-row">
                <span className="pill">Multi-session workspace</span>
                <span className="pill">OpenRouter debate modes</span>
                <span className="pill">Local-first persistence</span>
                <span className="pill">Evidence-aware analysis</span>
              </div>
              <div className="cta-row">
                <Link href="/debate/new" className="cta">
                  New debate
                </Link>
                <button className="ghost" type="button" onClick={handleCreateSample}>
                  Add sample room
                </button>
              </div>
            </div>
            <div className="stack">
              <div className="kpi-grid">
                <div className="kpi">
                  <strong>{sessions.length}</strong>
                  saved sessions
                </div>
                <div className="kpi">
                  <strong>{Object.keys(debateModeMeta).length}</strong>
                  debate modes
                </div>
                <div className="kpi">
                  <strong>Local</strong>
                  first persistence
                </div>
              </div>
              <div className="panel">
                <h2>Workspace view</h2>
                <p className="lede">
                  Start from a blank debate, duplicate a previous line of inquiry, or reopen any recent room. Each session keeps its own chat, evidence, and analysis outputs.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head-v2">
            <h2>Recent Sessions</h2>
            <Link href="/debate/new" className="ghost ghost-inline-v2">
              New debate
            </Link>
          </div>
          {sessions.length > 0 ? (
            <div className="workspace-grid-v2">
              {sessions.map((session) => (
                <article key={session.id} className="workspace-card-v2">
                  <div className="workspace-card-head-v2">
                    <div>
                      <strong>{session.title}</strong>
                      <p>{session.topic}</p>
                    </div>
                    <span className="workspace-mode-v2">{debateModeMeta[session.mode].label}</span>
                  </div>
                  <div className="workspace-meta-v2">
                    <span>{session.participantCount} participants</span>
                    <span>Updated {formatTime(session.updatedAt)}</span>
                  </div>
                  <div className="workspace-actions-v2">
                    <Link href={`/debate/${session.id}`} className="cta cta-small-v2">
                      Open
                    </Link>
                    <button className="ghost ghost-small-v2" type="button" onClick={() => handleDuplicate(session.id)}>
                      Duplicate
                    </button>
                    <button className="ghost ghost-small-v2" type="button" onClick={() => handleExport(session.id)}>
                      Export
                    </button>
                    <button className="ghost ghost-small-v2 danger-ghost-v2" type="button" onClick={() => handleDelete(session.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-workspace-v2 panel">
              <strong>No debate sessions yet.</strong>
              <p>Create a fresh room with your own framing, mode, and participant mix.</p>
            </div>
          )}
        </section>

        <section className="section">
          <h2>Foundation</h2>
          <div className="feature-grid">
            {features.map((feature) => (
              <FeatureCard key={feature.title} title={feature.title} description={feature.description} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
