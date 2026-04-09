"""Script to generate the complete main.py with dual model support."""
import pathlib

EOT = chr(60) + "|endoftext|" + chr(62)

content = f'''import os
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator, List
from supabase import create_client, Client
from datetime import datetime
import uuid

# PyTorch + tiktoken for local models
import torch
import torch.nn.functional as F
import tiktoken

from model_config import GPT, GPTConfig

load_dotenv()

# ============ Supabase Setup ============
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://dahtshitjyjxypcwudge.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhaHRzaGl0anlqeHlwY3d1ZGdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4MDY3NSwiZXhwIjoyMDg2MzU2Njc1fQ.BO6N8TvXR4Zx9gehecX6o_zMh8_fZq02cerchuPtUIo")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============ Load Models ============
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {{device}}")

config = GPTConfig()
enc = tiktoken.get_encoding("gpt2")
EOT_SPECIAL = "{EOT}"

MODEL_DIR = Path(__file__).parent.parent / "model"

# Dictionary to hold all loaded models
models = {{}}

# Load Buddy model (emotional companion)
print("Loading Buddy model...")
buddy_model = GPT(config)
buddy_ckpt = torch.load(str(MODEL_DIR / "buddy_model_final.pt"), map_location=device, weights_only=False)
buddy_model.load_state_dict(buddy_ckpt["model_state_dict"])
buddy_model.to(device)
buddy_model.eval()
models["buddy"] = buddy_model
print(f"  Buddy loaded: {{sum(p.numel() for p in buddy_model.parameters()):,}} params")

# Load Story Creator model (story generation)
print("Loading Story Creator model...")
story_model = GPT(config)
story_ckpt = torch.load(str(MODEL_DIR / "tiny_transformer_iter_15000.pt"), map_location=device, weights_only=False)
story_model.load_state_dict(story_ckpt["model_state_dict"])
story_model.to(device)
story_model.eval()
models["story_creator"] = story_model
print(f"  Story Creator loaded: {{sum(p.numel() for p in story_model.parameters()):,}} params")

# Free checkpoint memory
del buddy_ckpt, story_ckpt
if torch.cuda.is_available():
    torch.cuda.empty_cache()

print(f"All models loaded! Available: {{list(models.keys())}}")

# ============ FastAPI App ============
app = FastAPI(title="Buddy Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    thread_id: Optional[str] = None
    user_id: Optional[str] = None
    model: Optional[str] = "buddy"
    temperature: Optional[float] = 0.6


class ChatResponse(BaseModel):
    reply: str
    thread_id: str


class ConversationCreate(BaseModel):
    user_id: str
    title: Optional[str] = "New Chat"


class MessageCreate(BaseModel):
    conversation_id: str
    role: str
    content: str


# ============ Supabase Helper Functions ============

def get_conversation_messages(conversation_id: str) -> List[dict]:
    try:
        result = supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching messages: {{e}}")
        return []


def save_message(conversation_id: str, role: str, content: str) -> dict:
    try:
        message_data = {{
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": datetime.utcnow().isoformat()
        }}
        result = supabase.table("messages").insert(message_data).execute()
        return result.data[0] if result.data else message_data
    except Exception as e:
        print(f"Error saving message: {{e}}")
        return {{"id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": role, "content": content}}


def create_conversation(user_id: str, title: str = "New Chat") -> dict:
    try:
        conv_data = {{
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }}
        result = supabase.table("conversations").insert(conv_data).execute()
        return result.data[0] if result.data else conv_data
    except Exception as e:
        print(f"Error creating conversation: {{e}}")
        return {{"id": str(uuid.uuid4()), "user_id": user_id, "title": title}}


def update_conversation_title(conversation_id: str, title: str):
    try:
        supabase.table("conversations").update({{
            "title": title,
            "updated_at": datetime.utcnow().isoformat()
        }}).eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error updating conversation: {{e}}")


def get_user_conversations(user_id: str) -> List[dict]:
    try:
        result = supabase.table("conversations").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching conversations: {{e}}")
        return []


def delete_conversation(conversation_id: str):
    try:
        supabase.table("messages").delete().eq("conversation_id", conversation_id).execute()
        supabase.table("conversations").delete().eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error deleting conversation: {{e}}")


# ============ Model Inference ============

def get_model_and_prompt(model_name: str, user_message: str):
    """Get the correct model and formatted prompt based on model_name."""
    if model_name == "story_creator":
        # Story creator: just pass the message as a story prompt
        active_model = models.get("story_creator", models["buddy"])
        formatted_prompt = user_message
    else:
        # Default: Buddy emotional companion
        active_model = models["buddy"]
        formatted_prompt = f"User: {{user_message}}\\nBuddy:"
    return active_model, formatted_prompt


def generate_response(user_message: str, model_name: str = "buddy", temperature: float = 0.6, max_new_tokens: int = 200) -> str:
    """Generate a response from the selected model (non-streaming)."""
    active_model, formatted_prompt = get_model_and_prompt(model_name, user_message)
    tokens = enc.encode(formatted_prompt, allowed_special={{EOT_SPECIAL}})
    idx = torch.tensor(tokens, dtype=torch.long, device=device).unsqueeze(0)

    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -config.block_size:]
            logits, _ = active_model(idx_cond)
            logits = logits[:, -1, :] / temperature

            v, _ = torch.topk(logits, min(50, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float("Inf")

            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)

            if idx_next.item() == enc.eot_token:
                break

    full_output = enc.decode(idx[0].tolist())
    reply = full_output[len(formatted_prompt):].strip()
    return reply


def generate_tokens_stream(user_message: str, model_name: str = "buddy", temperature: float = 0.6, max_new_tokens: int = 200):
    """Generator that yields tokens one at a time for streaming."""
    active_model, formatted_prompt = get_model_and_prompt(model_name, user_message)
    tokens = enc.encode(formatted_prompt, allowed_special={{EOT_SPECIAL}})
    idx = torch.tensor(tokens, dtype=torch.long, device=device).unsqueeze(0)

    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -config.block_size:]
            logits, _ = active_model(idx_cond)
            logits = logits[:, -1, :] / temperature

            v, _ = torch.topk(logits, min(50, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float("Inf")

            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)

            token_id = idx_next.item()
            if token_id == enc.eot_token:
                break

            token_text = enc.decode([token_id])
            yield token_text


# ============ API Routes ============

@app.post("/api/conversations")
async def api_create_conversation(req: ConversationCreate):
    conv = create_conversation(req.user_id, req.title)
    return conv


@app.get("/api/conversations/{{user_id}}")
async def api_get_conversations(user_id: str):
    conversations = get_user_conversations(user_id)
    return {{"conversations": conversations}}


@app.get("/api/conversations/{{conversation_id}}/messages")
async def api_get_messages(conversation_id: str):
    messages = get_conversation_messages(conversation_id)
    return {{"messages": messages}}


@app.delete("/api/conversations/{{conversation_id}}")
async def api_delete_conversation(conversation_id: str):
    delete_conversation(conversation_id)
    return {{"success": True}}


@app.patch("/api/conversations/{{conversation_id}}")
async def api_update_conversation(conversation_id: str, title: str):
    update_conversation_title(conversation_id, title)
    return {{"success": True}}


@app.get("/api/models")
async def list_models():
    """List available models."""
    return {{
        "models": [
            {{"id": "buddy", "name": "Innocent Buddy", "description": "Empathetic emotional companion"}},
            {{"id": "story_creator", "name": "Story Creator", "description": "Creative story generation"}},
        ]
    }}


# Streaming endpoint
async def generate_stream_smooth(
    message: str,
    conversation_id: str,
    user_id: Optional[str],
    model_name: str,
    temperature: float
) -> AsyncGenerator[str, None]:
    full_response = ""

    try:
        # Save user message to Supabase
        if conversation_id and user_id:
            db_messages = get_conversation_messages(conversation_id)
            save_message(conversation_id, "user", message)

            if len(db_messages) == 0:
                title = message[:50] + ("..." if len(message) > 50 else "")
                update_conversation_title(conversation_id, title)

        # Generate tokens from selected model and stream them
        for token_text in generate_tokens_stream(message, model_name=model_name, temperature=temperature):
            full_response += token_text
            for char in token_text:
                yield f"data: {{json.dumps({{'content': char}})}}\\n\\n"
                await asyncio.sleep(0.008)

        # Save AI response to Supabase
        if conversation_id and user_id and full_response:
            save_message(conversation_id, "assistant", full_response)

        yield "data: [DONE]\\n\\n"

    except Exception as e:
        print(f"Streaming error: {{e}}")
        yield f"data: {{json.dumps({{'error': str(e)}})}}\\n\\n"
        yield "data: [DONE]\\n\\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    conversation_id = req.thread_id

    if not conversation_id and req.user_id:
        conv = create_conversation(req.user_id)
        conversation_id = conv["id"]

    async def stream_with_conv_id():
        yield f"data: {{json.dumps({{'conversation_id': conversation_id}})}}\\n\\n"
        async for chunk in generate_stream_smooth(
            message=req.message,
            conversation_id=conversation_id,
            user_id=req.user_id,
            model_name=req.model or "buddy",
            temperature=req.temperature or 0.6
        ):
            yield chunk

    return StreamingResponse(
        stream_with_conv_id(),
        media_type="text/event-stream",
        headers={{
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }}
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        conversation_id = req.thread_id

        if not conversation_id and req.user_id:
            conv = create_conversation(req.user_id)
            conversation_id = conv["id"]

        if conversation_id and req.user_id:
            save_message(conversation_id, "user", req.message)

        reply = generate_response(req.message, model_name=req.model or "buddy", temperature=req.temperature or 0.6)

        if conversation_id and req.user_id:
            save_message(conversation_id, "assistant", reply)

        return ChatResponse(reply=reply, thread_id=conversation_id or "guest")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {{"status": "healthy", "models": list(models.keys()), "device": device}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''

target = pathlib.Path(r"c:\Users\Tanmay\Desktop\Chatbot\Project\backend\main.py")
target.write_text(content, encoding="utf-8")
print(f"Written {len(content)} bytes to {target}")
