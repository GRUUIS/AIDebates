# Ethics Arena

A multi-agent AI debate chatroom prototype for moral and ethical dilemmas.

## Stack

- Next.js
- React
- TypeScript
- Vertex AI Express Mode

## Requirements

- Node.js 18+ recommended
- npm

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Fill local environment variables in `.env.local`:

```env
VERTEX_USE_EXPRESS_MODE=true
GOOGLE_API_KEY=your_vertex_express_api_key_here
VERTEX_MODEL=gemini-2.5-flash
VERTEX_FALLBACK_MODELS=gemini-2.5-pro
VERTEX_MULTIMODAL_MODEL=gemini-2.5-flash
VERTEX_EMBEDDING_MODEL=gemini-embedding-001
SEARCH_API_KEY=your_tavily_api_key_here
```

The API route will prefer Vertex AI Express Mode when `VERTEX_USE_EXPRESS_MODE=true` and `GOOGLE_API_KEY` is present. Search still uses Tavily in the current migration phase.
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
- Local project-specific skill drafts

## Notes

- This is a Node.js project, not a Python `venv` project.
- Dependencies are tracked in `package.json`.
- Real secrets should stay only in `.env.local`, which is ignored by git.

