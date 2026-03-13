# Ethics Arena

A multi-agent AI debate chatroom prototype for moral and ethical dilemmas.

## Stack

- Next.js
- React
- TypeScript
- OpenAI API

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
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
SEARCH_API_KEY=
```

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
- OpenAI-backed `/api/debate` route with mock fallback
- Local project-specific skill drafts

## Notes

- This is a Node.js project, not a Python `venv` project.
- Dependencies are tracked in `package.json`.
- Real secrets should stay only in `.env.local`, which is ignored by git.
