from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from inference_core import DEVICE, generate_reply, generate_reply_stream, list_models, resolve_max_tokens


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / ".data"
DB_PATH = DATA_DIR / "chatbot.db"
DEFAULT_LOCAL_USER = "local-user"


def utc_now() -> str:
    return datetime.utcnow().isoformat()


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
          ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
          ON messages(conversation_id, created_at);
        """
    )
    return conn


DB = get_db()


def conversation_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "title": row["title"],
        "model": row["model"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def message_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "created_at": row["created_at"],
    }


def create_conversation(model: str, title: str = "New Chat", user_id: str = DEFAULT_LOCAL_USER) -> dict:
    conversation_id = str(uuid4())
    now = utc_now()
    DB.execute(
        """
        INSERT INTO conversations (id, user_id, title, model, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (conversation_id, user_id, title, model, now, now),
    )
    DB.commit()
    row = DB.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return conversation_to_dict(row)


def get_conversation(conversation_id: str) -> dict | None:
    row = DB.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return conversation_to_dict(row) if row else None


def get_messages(conversation_id: str) -> list[dict]:
    rows = DB.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()
    return [message_to_dict(row) for row in rows]


def save_message(conversation_id: str, role: str, content: str) -> dict:
    message_id = str(uuid4())
    now = utc_now()
    DB.execute(
        """
        INSERT INTO messages (id, conversation_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (message_id, conversation_id, role, content, now),
    )
    DB.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (now, conversation_id),
    )
    DB.commit()
    row = DB.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
    return message_to_dict(row)


def update_conversation_title(conversation_id: str, title: str) -> None:
    DB.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title, utc_now(), conversation_id),
    )
    DB.commit()


def update_conversation_model(conversation_id: str, model: str) -> None:
    DB.execute(
        "UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?",
        (model, utc_now(), conversation_id),
    )
    DB.commit()


def list_conversations(user_id: str | None = None) -> list[dict]:
    effective_user = user_id or DEFAULT_LOCAL_USER
    rows = DB.execute(
        "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
        (effective_user,),
    ).fetchall()
    return [conversation_to_dict(row) for row in rows]


def delete_conversation(conversation_id: str) -> None:
    DB.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    DB.commit()


app = FastAPI(title="Offline Chatbot Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None
    user_id: str | None = None
    model: str = "nanochat"
    temperature: float = 0.6
    max_tokens: int | None = None


class ConversationCreate(BaseModel):
    title: str = "New Chat"
    model: str = "nanochat"
    user_id: str | None = None


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "device": DEVICE,
        "database": str(DB_PATH),
        "models": list_models(),
    }


@app.get("/api/models")
def api_models():
    return {"device": DEVICE, "models": list_models()}


@app.post("/api/conversations")
def api_create_conversation(req: ConversationCreate):
    return create_conversation(req.model, req.title, req.user_id or DEFAULT_LOCAL_USER)


@app.get("/api/conversations")
def api_get_conversations(user_id: str | None = Query(default=None)):
    return {"conversations": list_conversations(user_id)}


@app.get("/api/conversations/{legacy_user_id}")
def api_get_conversations_legacy(legacy_user_id: str):
    return {"conversations": list_conversations(legacy_user_id)}


@app.get("/api/conversations/{conversation_id}/messages")
def api_get_messages(conversation_id: str):
    return {"messages": get_messages(conversation_id)}


@app.patch("/api/conversations/{conversation_id}")
def api_update_conversation(conversation_id: str, title: str):
    update_conversation_title(conversation_id, title)
    return {"success": True}


@app.delete("/api/conversations/{conversation_id}")
def api_delete_conversation(conversation_id: str):
    delete_conversation(conversation_id)
    return {"success": True}


def build_title(message: str) -> str:
    return message[:50] + ("..." if len(message) > 50 else "")


async def stream_reply(req: ChatRequest, conversation_id: str) -> AsyncGenerator[str, None]:
    try:
        conversation = get_conversation(conversation_id)
        if not conversation:
            raise RuntimeError("Conversation not found")

        if conversation["model"] != req.model:
            update_conversation_model(conversation_id, req.model)

        existing_messages = get_messages(conversation_id)
        save_message(conversation_id, "user", req.message)

        if len(existing_messages) == 0:
            update_conversation_title(conversation_id, build_title(req.message))

        history = [
            {"role": message["role"], "content": message["content"]}
            for message in get_messages(conversation_id)
        ]
        stream = generate_reply_stream(
            model_id=req.model,
            history=history,
            temperature=req.temperature,
            max_new_tokens=resolve_max_tokens(req.max_tokens),
        )

        full_response = ""
        for token_text in stream:
            if not token_text:
                continue
            full_response += token_text
            yield f"data: {json.dumps({'content': token_text})}\n\n"
            await asyncio.sleep(0)

        save_message(conversation_id, "assistant", full_response)
        yield "data: [DONE]\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"


@app.post("/api/chat/stream")
async def api_chat_stream(req: ChatRequest):
    conversation_id = req.thread_id
    if not conversation_id:
        created = create_conversation(req.model, build_title(req.message), req.user_id or DEFAULT_LOCAL_USER)
        conversation_id = created["id"]

    async def event_stream():
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
        async for chunk in stream_reply(req, conversation_id):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/chat")
def api_chat(req: ChatRequest):
    conversation_id = req.thread_id
    if not conversation_id:
        created = create_conversation(req.model, build_title(req.message), req.user_id or DEFAULT_LOCAL_USER)
        conversation_id = created["id"]

    if not get_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")

    save_message(conversation_id, "user", req.message)
    history = [
        {"role": message["role"], "content": message["content"]}
        for message in get_messages(conversation_id)
    ]
    reply = generate_reply(
        model_id=req.model,
        history=history,
        temperature=req.temperature,
        max_new_tokens=resolve_max_tokens(req.max_tokens),
    )
    save_message(conversation_id, "assistant", reply)
    return {"reply": reply, "thread_id": conversation_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
