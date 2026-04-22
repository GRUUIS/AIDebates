# Vertex AI Migration Plan

## Goal

Replace the current OpenRouter-based provider flow with Google Cloud Vertex AI while preserving the current product shape:

- multi-role ethics debate
- planner + speaker + jury + judge + postmortem pipeline
- evidence search and ranking
- multimodal evidence ingestion
- optional speech and image generation

The recommended migration path is to keep the existing Next.js application architecture and swap the model provider layer from OpenRouter/OpenAI-compatible APIs to Vertex AI APIs.

This is a provider migration and interface refactor, not a simple API key replacement.

## Current Provider-Coupled Areas

The following files are directly tied to OpenRouter/OpenAI-compatible APIs:

- `lib/llm.ts`
- `lib/embeddings.ts`
- `lib/evidence.ts`
- `app/api/debate/route.ts`
- `app/api/speech/route.ts`
- `app/api/image/generate/route.ts`
- `.env.example`
- `README.md`

## Key Architecture Decision

Do not use Vertex AI Studio Agent Builder as the primary runtime for this app.

Reason:

- The app already owns the orchestration logic for moderator, debaters, jury, judge, and postmortem.
- Each "agent" in this app is really a prompt/persona plus session state, not a separate deployable platform agent.
- Porting that orchestration into Vertex Studio flows would add product and deployment complexity without clear benefits.
- Vertex Agent Engine currently centers on Python-based deployment flows, while this repository is a Next.js TypeScript app.

Recommended direction:

- Keep orchestration in app code.
- Call Gemini models from the Next.js server routes.
- Revisit ADK / Agent Engine only if a later phase needs a standalone multi-agent backend.

## Vertex Capability Fit

### 1. Debate Orchestration

Feasible.

Current code uses structured JSON outputs for:

- turn planning
- speaker generation
- jury votes
- judge report
- postmortem report

Gemini on Vertex supports controlled structured generation and function-calling-style workflows, so these parts can be reimplemented with schema-based output validation.

### 2. Multi-Role Roleplay

Feasible.

No special Vertex "Agent" object is required. The current approach of:

- one session state
- multiple prompts/personas
- repeated model calls

maps cleanly to Gemini calls from server-side code.

### 3. Embeddings

Feasible.

The current local cosine-similarity ranking pipeline can remain mostly unchanged. Only the embedding generation call needs to move from OpenAI embeddings to a Vertex embedding model.

### 4. Search and Grounding

Feasible, but there is an architecture choice.

Options:

- Keep Tavily for minimal migration risk.
- Replace Tavily with Google Search grounding for model-grounded answers.
- Replace Tavily with Vertex AI Search for a more managed retrieval system.

For a first migration pass, keeping Tavily is the least risky option because the current evidence-card ingestion flow already expects raw URLs and imported page content.

### 5. Image / PDF / Audio Evidence Understanding

Feasible.

The multimodal evidence extraction pipeline can be moved to Gemini. The logic in `lib/evidence.ts` can stay conceptually the same, but the request format must change.

### 6. Speech

Feasible, but should be treated as a separate product integration.

The current route assumes OpenAI-compatible chat-audio generation. On GCP, the safer long-term architecture is:

- text-to-speech via Google Cloud Text-to-Speech
- speech-to-text via Google Cloud Speech-to-Text or Gemini speech features

### 7. Image Generation

Feasible.

The dedicated image generation route can be moved to a Vertex image-capable Gemini model.

## What Must Be Replaced

### A. Provider Layer

File:

- `lib/llm.ts`

Current issues:

- hardcoded `openrouter | openai` provider union
- hardcoded OpenRouter base URL
- OpenAI SDK-centric client construction
- OpenAI/OpenRouter model naming assumptions

Required changes:

- add `vertex` provider
- introduce Vertex config fields
- stop assuming OpenAI-compatible endpoints for all operations
- split helper functions by capability instead of one shared OpenAI client abstraction

### B. Debate Generation Layer

File:

- `app/api/debate/route.ts`

Current issues:

- relies on `client.responses.create(...)`
- assumes OpenAI response shape
- hardcodes jury model IDs that come from OpenRouter aggregation

Required changes:

- replace planner/speaker/jury/judge/postmortem generation calls with Vertex-compatible generation helpers
- update jury model list to valid Gemini model choices
- preserve current schemas and app behavior

Important note:

The current `JURY_MODELS` list uses provider-aggregated model IDs:

- `openai/gpt-4o-mini`
- `anthropic/claude-3.5-haiku`
- `google/gemini-2.0-flash-001`

Under Vertex, those non-Google models are not available through the same OpenRouter-style route. The jury logic should be updated to use multiple Gemini variants or multiple temperature/prompt voting strategies.

### C. Embedding Layer

File:

- `lib/embeddings.ts`

Current issues:

- relies on `client.embeddings.create(...)`

Required changes:

- replace embedding generation with Vertex embedding API calls
- keep the index file format unchanged where possible

### D. Multimodal Evidence Extraction

File:

- `lib/evidence.ts`

Current issues:

- assumes OpenAI-style message parts for images, files, and audio
- uses a generic chat completion helper with OpenAI-compatible payloads

Required changes:

- introduce Vertex multimodal generation helper
- map image, PDF, and audio inputs into Vertex/Gemini content parts
- preserve current `EvidenceCard` shape

### E. Speech Route

File:

- `app/api/speech/route.ts`

Current issues:

- depends on OpenAI chat completion audio output

Required changes:

- either disable speech temporarily during migration
- or replace with Google Cloud Text-to-Speech

Recommendation:

Implement speech in a second migration phase unless speech is business-critical right now.

### F. Image Generation Route

File:

- `app/api/image/generate/route.ts`

Current issues:

- posts to `/images/generations`

Required changes:

- replace with Vertex image generation call
- normalize returned payload into the existing `dataUrl` response shape

### G. Environment and Docs

Files:

- `.env.example`
- `README.md`

Required changes:

- remove OpenRouter-first setup instructions
- document Vertex configuration
- document auth strategy choice

## Recommended New Environment Variables

For local development there are two viable auth strategies.

### Option 1. API key

Good for quick testing.

Suggested env:

```env
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=global
GOOGLE_API_KEY=your_google_api_key
VERTEX_MODEL=gemini-2.5-flash
VERTEX_FALLBACK_MODELS=gemini-2.5-pro
VERTEX_EMBEDDING_MODEL=gemini-embedding-001
SEARCH_API_KEY=your_tavily_api_key_here
```

### Option 2. Application Default Credentials

Better for production and safer than distributing raw API keys.

Suggested env:

```env
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
VERTEX_MODEL=gemini-2.5-flash
VERTEX_FALLBACK_MODELS=gemini-2.5-pro
VERTEX_EMBEDDING_MODEL=gemini-embedding-001
SEARCH_API_KEY=your_tavily_api_key_here
```

Recommendation:

- use API key only for the first local smoke test
- switch to ADC or service-account-backed auth for production

## Proposed Model Mapping

### Debate Planner / Speaker

- primary: `gemini-2.5-flash`
- fallback: `gemini-2.5-pro`

Reason:

- fast enough for turn-by-turn interaction
- strong structured output support

### Jury

Current OpenRouter jury uses model diversity. Under Vertex, use one of these patterns:

Option A. Multi-model Gemini jury

- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-2.5-flash-lite` if available in the target region/project

Option B. Single-model multi-sample jury

- run the same Gemini model 3 times with slightly different system prompts or temperatures

Recommendation:

Start with Option B if model availability is uncertain.

### Judge / Postmortem

- `gemini-2.5-pro`

Reason:

- these routes favor analysis quality over latency

### Embeddings

- `gemini-embedding-001`

### Image Generation

- image-capable Gemini model supported by the target project and region

### Speech

- not part of the main Gemini provider abstraction
- use Google Cloud Text-to-Speech separately

## Migration Phases

### Phase 1. Provider Core

Goal:

Get text debate generation working on Vertex.

Changes:

- add new Vertex provider config in `lib/llm.ts`
- introduce generation helpers for JSON/text output
- replace `responses.create(...)` in debate route
- update jury strategy to Gemini-only

Success criteria:

- a normal debate turn can be generated
- planner and speaker outputs validate against current JSON schema
- jury, judge, and postmortem still work

### Phase 2. Embeddings and Multimodal Evidence

Goal:

Preserve evidence ranking and uploaded evidence extraction.

Changes:

- replace embeddings API call in `lib/embeddings.ts`
- replace multimodal extraction calls in `lib/evidence.ts`

Success criteria:

- evidence ranking still returns coherent results
- image upload analysis works
- PDF upload analysis works
- audio upload analysis either works or degrades gracefully

### Phase 3. Image Generation

Goal:

Restore generated-image feature.

Changes:

- rewrite `app/api/image/generate/route.ts` for Vertex image generation

Success criteria:

- image route returns a valid `dataUrl`

### Phase 4. Speech

Goal:

Restore speech feature in a GCP-native way.

Changes:

- replace `app/api/speech/route.ts`

Success criteria:

- route returns playable audio
- voice mapping still works well enough for current speakers

### Phase 5. Search Strategy Review

Goal:

Decide whether to keep Tavily or move toward Google-native grounding.

Recommendation:

- keep Tavily during migration
- revisit Google-native search/grounding only after the provider swap is stable

## Suggested Code Refactor Shape

Instead of one provider-specific `OpenAI` client abstraction, split the provider layer into capability-focused helpers:

- `getLlmConfig()`
- `generateStructuredObject(...)`
- `generateText(...)`
- `embedText(...)`
- `generateImage(...)`

Optional later helpers:

- `transcribeAudio(...)`
- `synthesizeSpeech(...)`

This avoids repeating the current problem where every feature assumes OpenAI-compatible request and response formats.

## Practical Risks

### 1. Model Availability by Region / Project

Risk:

- some Gemini models may not be available in the selected project or region

Mitigation:

- keep fallback models configurable through env
- start with a single widely available primary model

### 2. Structured Output Differences

Risk:

- Gemini may produce schema-valid JSON differently from OpenAI responses

Mitigation:

- keep strict local parsing and validation
- centralize schema generation helpers

### 3. Speech Parity

Risk:

- current speech route is tightly coupled to OpenAI audio output behavior

Mitigation:

- migrate speech separately
- allow temporary feature flag or graceful disablement

### 4. Search Product Shape Drift

Risk:

- Google grounding is not a one-to-one replacement for URL-first evidence import

Mitigation:

- keep Tavily initially
- revisit search after main model migration is complete

## Recommendation Summary

### Best immediate path

1. Keep the app architecture.
2. Replace the provider layer with Vertex-compatible helpers.
3. Keep Tavily for search in the first pass.
4. Keep multi-role debate orchestration inside app code.
5. Do not rebuild this around Vertex Studio Agents UI.
6. Treat speech as a follow-up phase.

### Feasibility rating

- text debate migration: high
- embeddings migration: high
- multimodal evidence migration: medium-high
- image generation migration: high
- speech migration: medium
- replacing app orchestration with Vertex Studio Agents UI: low recommendation

## Immediate Implementation Order

1. `lib/llm.ts`
2. `app/api/debate/route.ts`
3. `lib/embeddings.ts`
4. `lib/evidence.ts`
5. `app/api/image/generate/route.ts`
6. `app/api/speech/route.ts`
7. `.env.example`
8. `README.md`
