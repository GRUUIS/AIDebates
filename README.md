# Ethics Arena

A "multi-agent" AI debate chatroom prototype for moral and ethical dilemmas.

## Stack

- Next.js
- React
- TypeScript
- Vertex AI Express Mode / OpenRouter (configurable)

## Requirements

- Node.js 18+ recommended
- npm

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Fill local environment variables in `.env.local` (pick ONE LLM provider option below):

### Option A: Vertex AI Express Mode

```env
VERTEX_USE_EXPRESS_MODE=true
GOOGLE_API_KEY=your_vertex_express_api_key_here
VERTEX_MODEL=gemini-2.5-flash
VERTEX_FALLBACK_MODELS=gemini-2.5-pro
VERTEX_MULTIMODAL_MODEL=gemini-2.5-flash
VERTEX_EMBEDDING_MODEL=gemini-embedding-001
# Optional:
# VERTEX_IMAGE_MODEL=gemini-2.5-flash-image
SEARCH_API_KEY=your_tavily_api_key_here
```

### Option B: OpenRouter

```env
# Disable Vertex, or leave it enabled but omit GOOGLE_API_KEY.
VERTEX_USE_EXPRESS_MODE=false

OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=deepseek/deepseek-v3.2

SEARCH_API_KEY=your_tavily_api_key_here
```

Provider precedence in code (`lib/llm.ts`):
- Vertex (when `VERTEX_USE_EXPRESS_MODE=true` and `GOOGLE_API_KEY` is present)
- OpenRouter (when `OPENROUTER_API_KEY` is present)
- OpenAI (when `OPENAI_API_KEY` is present)

Search still uses Tavily in the current migration phase.
Get search key here: https://www.tavily.com/

3. Start the development server:

```bash
npm run dev
```

4. Build for production check:

```bash
npm run build
```

## Current Status

- Home page prototype
- Debate room prototype
- Mock debate flow
- Vertex-backed `/api/debate` route with mock fallback
- Vertex-backed `/api/image/generate` route
- Tavily-backed evidence search plus URL/PDF/image evidence ingestion
- Embedding-based evidence ranking and claim similarity
- Jury, judge, stance-shift, and postmortem debate modes
- TTS/STT work has been deferred and is not included in the current shipped feature set
- Local project-specific skill drafts

## Notes

- This is a Node.js project, not a Python `venv` project.
- Dependencies are tracked in `package.json`.
- Real secrets should stay only in `.env.local`, which is ignored by git.

