import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";

const features = [
  {
    title: "Debaters With Distinct Moral Lenses",
    description:
      "Run multiple AI participants as utilitarian, deontological, virtue-ethics, or policy-oriented speakers instead of collapsing everything into one blended answer."
  },
  {
    title: "Moderator-Led Turn Structure",
    description:
      "Use a moderator agent to frame the issue, assign rebuttals, request evidence, and keep the room from looping into repetitive talking points."
  },
  {
    title: "Evidence Cards In The Chat Flow",
    description:
      "Attach retrieved papers, articles, or case studies to concrete claims so the debate feels grounded rather than purely performative."
  }
];

export default function HomePage() {
  return (
    <main className="page-pad">
      <div className="shell stack">
        <section className="hero-card">
          <span className="eyebrow">Ethics Arena</span>
          <div className="hero-grid">
            <div>
              <h1 className="hero-title">A chatroom where AI agents argue like people with principles.</h1>
              <p className="lede">
                Build a multi-agent debate system around difficult moral questions. Each participant holds a stable
                ethical lens, cites outside material, and answers both the user and the other agents inside a guided
                conversation.
              </p>
              <div className="pill-row">
                <span className="pill">Multi-agent orchestration</span>
                <span className="pill">Retrieval-augmented argumentation</span>
                <span className="pill">User participation</span>
                <span className="pill">Safety-aware moderation</span>
              </div>
              <div className="cta-row">
                <Link href="/debate" className="cta">
                  Open prototype room
                </Link>
                <a className="ghost" href="/AI_Ethics_Debate_Project_Proposal.pdf" target="_blank" rel="noreferrer">
                  View proposal PDF
                </a>
              </div>
            </div>
            <div className="stack">
              <div className="kpi-grid">
                <div className="kpi">
                  <strong>4</strong>
                  voices in the first MVP
                </div>
                <div className="kpi">
                  <strong>1</strong>
                  moderator with turn control
                </div>
                <div className="kpi">
                  <strong>3</strong>
                  priority skills drafted locally
                </div>
              </div>
              <div className="panel">
                <h2>Why this scope works</h2>
                <p className="lede">
                  The MVP focuses on the hard parts that matter academically: role separation, structured rebuttal,
                  source grounding, and a user who can interrupt the flow. Video and image retrieval stay optional.
                </p>
              </div>
            </div>
          </div>
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
