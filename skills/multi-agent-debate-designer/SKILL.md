---
name: multi-agent-debate-designer
description: Design and refine multi-agent debate systems for Ethics Arena or similar AI chatrooms. Use when defining agent personas, moderator logic, rebuttal rules, turn structure, memory behavior, debate scoring, or summary behavior for moral and ethical discussions.
---

# Multi-Agent Debate Designer

Define debate behavior before editing UI or API code.

## Workflow

1. Identify the debate topic, audience, and desired room format.
2. Define each agent with:
   - lens;
   - stance;
   - style;
   - hard constraints;
   - failure modes to avoid.
3. Define the moderator's job:
   - frame the issue;
   - choose the next speaker;
   - stop repetition;
   - request evidence;
   - summarize conflicts fairly.
4. Specify turn rules:
   - opening statement;
   - rebuttal;
   - user intervention;
   - evidence request;
   - closing summary.
5. Write agent prompts that force response to the latest concrete claim instead of generic speeches.

## Design Rules

- Keep the first MVP to 3 or 4 debaters plus 1 moderator.
- Give each agent non-overlapping reasoning habits.
- Make every rebuttal target one explicit claim from the previous turn.
- Require the speaker to cite supplied evidence or explicitly request more evidence.
- Prefer short, high-density turns over long speeches.

## Output Format

When asked to design or refine a debate setup, produce:

1. agent table;
2. turn structure;
3. moderator policy;
4. prompt snippets;
5. risks and mitigation notes.
