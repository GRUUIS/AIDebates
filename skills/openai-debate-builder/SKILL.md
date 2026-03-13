---
name: openai-debate-builder
description: Implement OpenAI-powered orchestration for Ethics Arena or similar multi-agent debate apps. Use when creating prompts, structured outputs, tool flows, debate turn APIs, or cost-aware model usage for moderator, debater, and summarizer agents.
---

# OpenAI Debate Builder

Prefer simple orchestration that the project can finish this semester.

## Workflow

1. Define the minimum set of model roles:
   - moderator;
   - debater;
   - summarizer;
   - optional retrieval planner.
2. Decide what each call must return in structured form.
3. Keep prompts role-specific and compact.
4. Make the orchestrator responsible for turn order and tool access.
5. Add cost and latency control early.

## Implementation Rules

- Avoid letting every debater call tools freely in the first version.
- Prefer one backend orchestrator that decides when evidence is needed.
- Use structured JSON outputs for:
  - next speaker;
  - sub-question;
  - draft reply;
  - evidence requests;
  - final summary.
- Reuse short history windows plus explicit summaries instead of dumping full transcripts.

## Output Format

When asked to implement or refine OpenAI usage, produce:

1. call graph;
2. prompt layout;
3. JSON schemas;
4. API route plan;
5. latency and cost notes.
