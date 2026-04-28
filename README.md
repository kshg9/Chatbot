# Offline NanoChat Workbench

This project now runs offline as a single Next.js application with local SQLite persistence and Python-based model inference.

## Architecture

- `frontend/` is the only app you run.
- `frontend/src/app/actions.ts` contains server actions for chat CRUD and generation.
- `frontend/src/lib/offline-db.ts` stores conversations, messages, and settings in SQLite.
- `backend/offline_inference.py` loads the local checkpoints and generates replies.
- `backend/model_config.py` and `backend/nanochat_runtime.py` are reused as the model runtime layer.

There is no Supabase dependency in the active app flow and no FastAPI server to start.

## Model files

After running:

```bash
python backend/download_nanochat.py
```

you should have local files like:

```text
model/
├── model_000650.pt
├── tokenizer.pkl
└── nanochat/
    ├── meta_000650.json
    └── tokenizer.pkl
```

The offline runtime reads those files directly.

## Local data

SQLite is created automatically at:

```text
frontend/.data/chatbot.db
```

That database stores:

- conversations
- messages
- app settings such as model and temperature

## Run it

### Python runtime dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend dependencies

```bash
cd frontend
npm install
```

### Start the app

```bash
cd frontend
npm run dev
```

Then open `http://localhost:3000`.

## Current behavior

- chats are stored locally in SQLite
- generation runs locally through Python
- model selection and temperature are stored locally
- conversation history is passed into the offline runtime as prompt context

## Important notes

- The old Supabase schema and FastAPI files are still in the repo as legacy material, but the active app flow no longer depends on them.
- If you want to remove the legacy code entirely, the next cleanup pass should delete the unused Supabase/auth/UI files and trim the Python directory to inference-only files.
