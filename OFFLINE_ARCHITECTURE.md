# Offline Architecture

## Goal

The active app now runs offline with:

- local SQLite persistence
- local Python model inference
- no FastAPI requirement
- no Supabase requirement
- no external chat API

## Runtime shape

The project is split into two local-only runtimes:

### 1. Next.js app

Located in `frontend/`.

Responsibilities:

- renders the UI
- owns server actions
- reads and writes SQLite
- invokes Python inference locally

Important files:

- `frontend/src/app/page.tsx`
- `frontend/src/app/actions.ts`
- `frontend/src/components/offline-chat-app.tsx`
- `frontend/src/lib/offline-db.ts`
- `frontend/src/lib/chat-engine.ts`

### 2. Python model runtime

Located in `backend/`.

Responsibilities:

- loads the local model files from `model/`
- formats prompt context from recent chat messages
- generates a reply for the selected model

Important files:

- `backend/offline_inference.py`
- `backend/model_config.py`
- `backend/nanochat_runtime.py`

## Data flow

### Sending a message

1. The user types into the Next.js UI.
2. The client component calls `sendMessageAction`.
3. The server action updates SQLite with the user message.
4. The server action loads the full conversation from SQLite.
5. The server action calls `frontend/src/lib/chat-engine.ts`.
6. `chat-engine.ts` spawns `python3 backend/offline_inference.py`.
7. The Python script loads the requested local model and generates a reply.
8. The server action stores the assistant reply in SQLite.
9. The updated conversation is returned to the UI.

## SQLite schema

SQLite lives at:

`frontend/.data/chatbot.db`

Tables:

- `conversations`
  - `id`
  - `title`
  - `model`
  - `created_at`
  - `updated_at`

- `messages`
  - `id`
  - `conversation_id`
  - `role`
  - `content`
  - `created_at`

- `settings`
  - `key`
  - `value`

## Why this is different from the old project

The old app depended on:

- Supabase auth and storage
- FastAPI as a separate backend server
- client-to-server HTTP chat calls

The new app removes that split. The browser now talks only to Next.js, and Next.js talks to SQLite and the local Python runtime.

## Current tradeoffs

- The app is offline-first, but generation is currently non-streaming.
- Python inference is spawned per message, so startup overhead still exists per request.
- The legacy Supabase/FastAPI files remain in the repo, but they are no longer part of the active flow.

## Next cleanup steps

1. Delete unused Supabase auth pages, stores, and legacy chat components.
2. Remove unused FastAPI-specific code if you no longer want to keep it for reference.
3. Add richer prompt-window management per model.
4. Add streaming from Python to the UI if you want token-by-token local output.
