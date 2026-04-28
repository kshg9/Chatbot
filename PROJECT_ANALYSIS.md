# Project Analysis

## What this project is

This is a full-stack local-model chat app:

- `frontend/` is a Next.js app that handles auth, chat UI, settings, and local state.
- `backend/` is a FastAPI server that loads local PyTorch checkpoints and streams generated text over SSE.
- `supabase-schema.sql` defines chat storage tables and Supabase auth-related tables/policies.

Despite the root `README.md`, the current codebase is not using Gemini, LangChain, or LangGraph. It is a local-model chatbot with Supabase-backed persistence.

## How it works

### 1. Frontend startup

The app renders `ChatContainer` from `frontend/src/app/page.tsx`.

Global setup happens in `frontend/src/app/providers.tsx`:

- initializes Supabase auth
- stores the signed-in user in Zustand
- loads conversations from the backend when a user is present

### 2. Auth flow

`frontend/src/store/auth-store.ts` uses the browser Supabase client to:

- sign in
- sign up
- sign out
- restore the existing session on load

The frontend auth state is independent from the backend. The backend does not validate the Supabase session token. It only receives `user_id` from the client.

### 3. Chat state

`frontend/src/store/chat-store.ts` is the main client state layer. It stores:

- chat list
- current chat id
- per-chat message arrays
- settings such as model and temperature
- loading and generation flags

When a new chat starts, the store creates a temporary id like `temp_xxx`. After the backend creates a real conversation row, the frontend replaces the temp id with the database id.

### 4. Sending a message

`frontend/src/components/chat/chat-container.tsx` drives message sending:

1. Create a temp chat if needed.
2. Add the user message locally.
3. Add an empty assistant message locally.
4. POST to `/api/chat/stream`.
5. Read SSE chunks from the response body.
6. Append streamed text into the assistant message.

The frontend sends:

- `message`
- `thread_id`
- `user_id`
- `model`
- `temperature`

### 5. Backend request handling

`backend/main.py` exposes:

- conversation CRUD endpoints
- `/api/chat`
- `/api/chat/stream`
- `/api/models`
- `/health`

For a streamed request:

1. If `thread_id` is missing and `user_id` exists, a conversation row is created.
2. The user message is saved to Supabase.
3. The selected model generates output token by token.
4. The backend streams the output as SSE.
5. The final assistant text is saved to Supabase.

### 6. Model layer

The backend supports three model ids:

- `buddy`
- `story_creator`
- `nanochat`

`buddy` and `story_creator` use the generic GPT implementation in `backend/model_config.py`.
`nanochat` uses a dedicated runtime in `backend/nanochat_runtime.py`.

Models are loaded lazily on first use and cached in memory afterward.

### 7. Persistence

Supabase stores:

- `conversations`
- `messages`
- `profiles`

The frontend does not talk directly to the chat tables. It talks to FastAPI, and FastAPI writes to Supabase.

## Important behavior to understand

### Stored chat history is not used as model context

This is the biggest behavioral gap in the app.

The backend saves messages to Supabase, but generation only uses the latest `user_message`. It does not build a prompt from prior turns.

That means:

- conversations are persisted for UI/history purposes
- the model does not truly "remember" the conversation
- regenerate also just resends the earlier user message as a fresh prompt

So this app currently behaves more like "single-turn prompts grouped into conversations" than a real multi-turn chatbot.

## Main inefficiencies and risks

### 1. Backend trust boundary is unsafe

The backend uses a Supabase key from env and trusts `user_id` supplied by the client.

Implication:

- anyone who can call the backend can read or write another user’s chat data by sending a different `user_id` or `conversation_id`
- Supabase RLS policies are largely bypassed if the backend uses the service role key

This is the highest-priority issue.

### 2. Conversation fetch happens twice on login

Both of these trigger chat loading:

- `frontend/src/app/providers.tsx`
- `frontend/src/components/chat/chat-container.tsx`

That duplicates the same network request and state updates during startup.

### 3. Streaming is character-by-character, not token-by-token

The backend already generates token text, but then splits each token into characters and sleeps for every character before emitting it.

Implication:

- much more SSE traffic than necessary
- more React state updates than necessary
- artificial latency
- wasted CPU on both client and server

This is one of the clearest performance wins.

### 4. Every streamed chunk rewrites the whole chats tree

`appendToMessage` maps through all chats and all messages on every chunk.

This is acceptable for tiny histories, but it scales poorly:

- O(number of chats/messages) work per chunk
- frequent rerenders during streaming
- expensive with long responses

### 5. Markdown rendering path is heavy

Each completed assistant message runs through:

- `react-markdown`
- custom renderers
- syntax highlighter

That is normal for rich chat UIs, but combined with frequent state updates it gets expensive as transcripts grow.

### 6. Chat history deletion is sequential

`clearAllChats` deletes one chat at a time in a loop.

Implication:

- slow bulk delete
- many round trips
- partial cleanup if one request fails midway

### 7. Auth subscription cleanup is missing

`auth-store.ts` registers `supabase.auth.onAuthStateChange(...)` but does not unsubscribe.

This is mostly a lifecycle hygiene issue, but it can cause duplicate listeners during dev/hot reload.

### 8. Documentation and schema are out of sync with the code

Examples:

- README says Next.js 15, package is Next 16
- README says Gemini/LangGraph, code uses local PyTorch models
- schema default profile settings still mention `gemini-2.5-flash`

This makes the project harder to maintain because the docs teach the wrong architecture.

### 9. Backend does extra DB work just to detect first message

On stream start it fetches all conversation messages only to check if the conversation is empty before updating the title.

That can be replaced with a cheaper existence/count check, or handled at conversation creation time.

### 10. No real server-side ownership checks on conversation endpoints

Endpoints like:

- get messages
- list conversations
- delete conversation
- rename conversation

accept ids directly without validating that the current authenticated user owns them.

This is related to issue 1, but it affects every CRUD route.

## What you could do next

### Highest-value changes

1. Fix backend auth first.
   - Require a real Supabase JWT from the frontend.
   - Verify it in FastAPI.
   - Derive user identity from the token, not from request body.
   - Enforce conversation ownership server-side.

2. Make chat generation multi-turn.
   - Load recent messages for the conversation.
   - Build a prompt from the last N turns.
   - Keep token budgets bounded per model.

3. Stream token chunks directly.
   - Emit one SSE event per token or per buffered token group.
   - Remove per-character sleeps.
   - Batch frontend appends to reduce rerenders.

4. Remove duplicated chat-loading logic.
   - Keep startup loading in one place only.

5. Decide on a single source of truth for chat state.
   - Either keep chat messages primarily server-backed
   - or keep a deliberate local cache with invalidation rules
   - but avoid half-local, half-remote behavior without explicit sync rules

### Good second-wave improvements

1. Add API contracts and types shared between frontend and backend.
2. Add pagination or lazy loading for long conversation histories.
3. Add backend tests for auth, conversation ownership, and chat endpoints.
4. Add a proper model capability/config registry so UI options come from `/api/models`.
5. Update docs to reflect the real stack and real model flow.
6. Move title generation into one place and avoid repeated first-message checks.

## Recommended roadmap

### Phase 1: Correctness and security

- verify JWT on backend
- stop trusting `user_id` from client
- enforce ownership checks
- update docs to reflect the current system

### Phase 2: Chat quality

- include recent conversation history in prompts
- define prompt templates per model
- add truncation/windowing logic

### Phase 3: Performance

- token-level or batched SSE streaming
- reduce Zustand updates during streaming
- avoid duplicate loads
- optimize transcript rendering for large chats

## Short summary

The project works as a local-model chat app with a polished frontend and basic persistence, but its current architecture has three major weaknesses:

1. the backend trust model is unsafe
2. stored conversation history is not actually used for generation
3. streaming/state updates are more expensive than they need to be

If you fix those three areas first, the project becomes much more credible technically and much easier to extend.
