# Skills Plan For Ethics Arena

## Goal
These skills are intended to make the project faster to build and more consistent to maintain. They are designed for repeated use during architecture, implementation, evaluation, and prompt tuning.

## Recommended New Skills

### 1. `project-architect`
Purpose:
Define the system architecture, module boundaries, data flow, API contracts, and implementation plan for this project.

When to use:
- when planning the repository structure;
- when defining backend/frontend boundaries;
- when deciding how orchestration, storage, and retrieval should connect;
- when preparing technical design notes before coding.

Suggested default prompt:
"Design or refine the architecture for the Ethics Arena project. Produce a concrete implementation plan with modules, data flow, API boundaries, storage choices, and tradeoff notes. Prefer pragmatic decisions that fit a student final project."

### 2. `multi-agent-debate-designer`
Purpose:
Design agent personas, moderator rules, debate turn structure, memory rules, and scoring or summarization logic for an ethical debate system.

When to use:
- when defining agent identities and moral frameworks;
- when prompts feel too similar across agents;
- when the debate becomes repetitive or disorganized;
- when designing moderator and judge behavior.

Suggested default prompt:
"Design or improve the multi-agent debate system for Ethics Arena. Define agent personas, values, speaking constraints, moderator rules, rebuttal structure, memory handling, and end-of-session summary logic."

### 3. `rag-source-manager`
Purpose:
Define how external sources are searched, filtered, summarized, ranked, stored, and cited inside the debate flow.

When to use:
- when integrating search APIs;
- when improving evidence quality;
- when deciding source schemas and citation formats;
- when creating prompts that use retrieved documents safely.

Suggested default prompt:
"Design or improve the retrieval and citation pipeline for Ethics Arena. Define source types, ranking rules, summarization format, citation schema, evidence card fields, and safe usage rules for agent responses."

### 4. `openai-debate-builder`
Purpose:
Guide implementation of OpenAI API usage for multi-agent orchestration, structured outputs, prompt design, tool calling, and cost-aware generation.

When to use:
- when wiring the OpenAI API;
- when choosing model roles for moderator, debaters, and summarizer;
- when defining structured JSON outputs;
- when reducing latency and token usage.

Suggested default prompt:
"Implement or refine OpenAI API usage for Ethics Arena. Focus on multi-agent orchestration, structured outputs, tool usage, prompt layout, cost control, and response reliability."

### 5. `ethics-safety-guard`
Purpose:
Create safety boundaries for sensitive ethical topics while preserving meaningful debate quality.

When to use:
- when handling self-harm, violence, hate, discrimination, sexuality, or minors-related topics;
- when designing moderation rules;
- when writing fallback responses for unsafe turns.

Suggested default prompt:
"Define safety and moderation rules for Ethics Arena. Identify risky topic categories, safe response boundaries, moderation checks, fallback behaviors, and how to preserve useful debate without enabling harm."

### 6. `demo-evaluator`
Purpose:
Prepare evaluation scenarios, test prompts, demo scripts, and grading-oriented evidence for the final presentation.

When to use:
- when preparing class demo material;
- when comparing debate quality across versions;
- when collecting screenshots and sample transcripts;
- when preparing a final report or presentation.

Suggested default prompt:
"Create an evaluation and demo plan for Ethics Arena. Propose test scenarios, expected behaviors, comparison criteria, presentation flow, and artifacts that best support a final project demonstration."

## Priority Recommendation
If only three new skills are created first, prioritize:

1. `multi-agent-debate-designer`
2. `rag-source-manager`
3. `openai-debate-builder`

These three skills cover the hardest parts of the project: agent identity, evidence grounding, and API orchestration.

## Can Codex Write And Use These Skills?
Yes. I can draft these skills as actual skill folders with `SKILL.md` files and supporting references, as long as you want them created in a place we can write to.

For this workspace, the practical approach is:

- draft the skill content inside the project folder first;
- review the wording together;
- if you want them installed into your Codex skills directory, copy or install them afterward using the standard skill workflow.

I can also use the skills I write in later turns if they are available in the session or installed into the readable skill location.

## Practical Note
For this project, the best initial skill set is not a large set of generic helpers. It is a small set of highly targeted project-specific skills that capture reusable decisions and reduce rework.
