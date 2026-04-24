import os
import json
import asyncio
from pathlib import Path
from dataclasses import dataclass
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator, List, Callable
from supabase import create_client, Client
from datetime import datetime
import uuid

# PyTorch + tiktoken for local models
import torch
import torch.nn.functional as F
import tiktoken

from model_config import GPT, GPTConfig
from nanochat_runtime import NanoChatRuntime, get_nanochat_spec

load_dotenv()

# ============ Supabase Setup ============
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY. Set them in backend/.env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============ Load Models ============
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {device}")

config = GPTConfig()
enc = tiktoken.get_encoding("gpt2")
EOT_SPECIAL = "<|endoftext|>"

MODEL_DIR = Path(__file__).parent.parent / "model"
DEFAULT_MAX_TOKENS = 96
MAX_MAX_TOKENS = 256


@dataclass
class LoadedModel:
    model: Optional[torch.nn.Module]
    block_size: Optional[int]
    tokenizer: Optional[object]
    prompt_builder: Optional[Callable[[str], str]]
    name: str
    description: str
    custom_runtime: Optional[NanoChatRuntime] = None


def build_buddy_prompt(user_message: str) -> str:
    return f"User: {user_message}\nBuddy:"


def build_raw_prompt(user_message: str) -> str:
    return user_message


MODEL_SPECS = {
    "buddy": {
        "name": "Innocent Buddy",
        "description": "Empathetic emotional companion",
        "checkpoint": "buddy_model_final.pt",
        "model_factory": lambda: GPT(GPTConfig()),
        "state_key": "model_state_dict",
        "block_size": GPTConfig().block_size,
        "tokenizer": enc,
        "prompt_builder": build_buddy_prompt,
    },
    "story_creator": {
        "name": "Story Creator",
        "description": "Creative story generation",
        "checkpoint": "tiny_transformer_iter_15000.pt",
        "model_factory": lambda: GPT(GPTConfig()),
        "state_key": "model_state_dict",
        "block_size": GPTConfig().block_size,
        "tokenizer": enc,
        "prompt_builder": build_raw_prompt,
    },
    "nanochat": get_nanochat_spec(MODEL_DIR, device),
}


def extract_state_dict(checkpoint, state_key: Optional[str]):
    if state_key is None:
        return checkpoint
    if not isinstance(checkpoint, dict) or state_key not in checkpoint:
        raise KeyError(f"Expected checkpoint key '{state_key}'")
    return checkpoint[state_key]


def load_model(model_id: str) -> LoadedModel:
    spec = MODEL_SPECS[model_id]
    print(f"Loading {spec['name']} model...")
    if "runtime_factory" in spec:
        runtime = spec["runtime_factory"]()
        print(f"  {spec['name']} loaded: {sum(p.numel() for p in runtime.model.parameters()):,} params")
        return LoadedModel(
            model=None,
            block_size=None,
            tokenizer=None,
            prompt_builder=None,
            name=spec["name"],
            description=spec["description"],
            custom_runtime=runtime,
        )

    model = spec["model_factory"]()
    checkpoint = torch.load(
        str(MODEL_DIR / spec["checkpoint"]),
        map_location=device,
        weights_only=False,
    )
    state_dict = extract_state_dict(checkpoint, spec["state_key"])
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    print(f"  {spec['name']} loaded: {sum(p.numel() for p in model.parameters()):,} params")
    return LoadedModel(
        model=model,
        block_size=spec["block_size"],
        tokenizer=spec["tokenizer"],
        prompt_builder=spec["prompt_builder"],
        name=spec["name"],
        description=spec["description"],
    )

# Dictionary to hold loaded models on demand
models = {}


def ensure_model_loaded(model_id: str) -> LoadedModel:
    selected_model_id = model_id if model_id in MODEL_SPECS else "buddy"
    if selected_model_id not in models:
        models[selected_model_id] = load_model(selected_model_id)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    return models[selected_model_id]


print(f"Model registry ready. Available: {list(MODEL_SPECS.keys())}")

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
    model: Optional[str] = "nanochat"
    temperature: Optional[float] = 0.6
    max_tokens: Optional[int] = DEFAULT_MAX_TOKENS


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
        print(f"Error fetching messages: {e}")
        return []


def save_message(conversation_id: str, role: str, content: str) -> dict:
    try:
        message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": datetime.utcnow().isoformat()
        }
        result = supabase.table("messages").insert(message_data).execute()
        return result.data[0] if result.data else message_data
    except Exception as e:
        print(f"Error saving message: {e}")
        return {"id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": role, "content": content}


def create_conversation(user_id: str, title: str = "New Chat") -> dict:
    try:
        conv_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        result = supabase.table("conversations").insert(conv_data).execute()
        return result.data[0] if result.data else conv_data
    except Exception as e:
        print(f"Error creating conversation: {e}")
        return {"id": str(uuid.uuid4()), "user_id": user_id, "title": title}


def update_conversation_title(conversation_id: str, title: str):
    try:
        supabase.table("conversations").update({
            "title": title,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error updating conversation: {e}")


def get_user_conversations(user_id: str) -> List[dict]:
    try:
        result = supabase.table("conversations").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        return []


def delete_conversation(conversation_id: str):
    try:
        supabase.table("messages").delete().eq("conversation_id", conversation_id).execute()
        supabase.table("conversations").delete().eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error deleting conversation: {e}")


# ============ Model Inference ============

def get_model_and_prompt(model_name: str, user_message: str):
    """Get the correct model and formatted prompt based on model_name."""
    runtime = ensure_model_loaded(model_name)
    if runtime.custom_runtime is not None:
        return runtime, None
    formatted_prompt = runtime.prompt_builder(user_message)
    return runtime, formatted_prompt


def sample_next_token(logits: torch.Tensor, temperature: float) -> torch.Tensor:
    safe_temperature = max(float(temperature), 1e-5)
    logits = logits / safe_temperature
    logits = torch.nan_to_num(logits, nan=-1e9, posinf=1e9, neginf=-1e9)

    v, _ = torch.topk(logits, min(50, logits.size(-1)))
    logits[logits < v[:, [-1]]] = -float("Inf")
    logits = torch.nan_to_num(logits, nan=-1e9, posinf=1e9, neginf=-1e9)

    probs = F.softmax(logits, dim=-1)
    probs = torch.nan_to_num(probs, nan=0.0, posinf=0.0, neginf=0.0)
    probs_sum = probs.sum(dim=-1, keepdim=True)

    if torch.any(probs_sum <= 0):
        return torch.argmax(logits, dim=-1, keepdim=True)

    probs = probs / probs_sum
    return torch.multinomial(probs, num_samples=1)


def resolve_max_tokens(requested_max_tokens: Optional[int]) -> int:
    if requested_max_tokens is None:
        return DEFAULT_MAX_TOKENS
    return max(1, min(int(requested_max_tokens), MAX_MAX_TOKENS))


def generate_response(user_message: str, model_name: str = "buddy", temperature: float = 0.6, max_new_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    """Generate a response from the selected model (non-streaming)."""
    runtime, formatted_prompt = get_model_and_prompt(model_name, user_message)
    if runtime.custom_runtime is not None:
        return runtime.custom_runtime.generate_response(
            user_message,
            temperature=temperature,
            max_new_tokens=max_new_tokens,
        )
    tokens = runtime.tokenizer.encode(formatted_prompt, allowed_special={EOT_SPECIAL})
    idx = torch.tensor(tokens, dtype=torch.long, device=device).unsqueeze(0)
    generated_tokens = []

    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -runtime.block_size:]
            logits, _ = runtime.model(idx_cond)
            logits = logits[:, -1, :]
            idx_next = sample_next_token(logits, temperature)
            idx = torch.cat((idx, idx_next), dim=1)

            if idx_next.item() == runtime.tokenizer.eot_token:
                break
            generated_tokens.append(idx_next.item())

    reply = runtime.tokenizer.decode(generated_tokens).strip()
    return reply


def generate_tokens_stream(user_message: str, model_name: str = "buddy", temperature: float = 0.6, max_new_tokens: int = DEFAULT_MAX_TOKENS):
    """Generator that yields tokens one at a time for streaming."""
    runtime, formatted_prompt = get_model_and_prompt(model_name, user_message)
    if runtime.custom_runtime is not None:
        yield from runtime.custom_runtime.generate_tokens_stream(
            user_message,
            temperature=temperature,
            max_new_tokens=max_new_tokens,
        )
        return
    tokens = runtime.tokenizer.encode(formatted_prompt, allowed_special={EOT_SPECIAL})
    idx = torch.tensor(tokens, dtype=torch.long, device=device).unsqueeze(0)

    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -runtime.block_size:]
            logits, _ = runtime.model(idx_cond)
            logits = logits[:, -1, :]
            idx_next = sample_next_token(logits, temperature)
            idx = torch.cat((idx, idx_next), dim=1)

            token_id = idx_next.item()
            if token_id == runtime.tokenizer.eot_token:
                break

            token_text = runtime.tokenizer.decode([token_id])
            yield token_text


# ============ API Routes ============

@app.post("/api/conversations")
async def api_create_conversation(req: ConversationCreate):
    conv = create_conversation(req.user_id, req.title)
    return conv


@app.get("/api/conversations/{user_id}")
async def api_get_conversations(user_id: str):
    conversations = get_user_conversations(user_id)
    return {"conversations": conversations}


@app.get("/api/conversations/{conversation_id}/messages")
async def api_get_messages(conversation_id: str):
    messages = get_conversation_messages(conversation_id)
    return {"messages": messages}


@app.delete("/api/conversations/{conversation_id}")
async def api_delete_conversation(conversation_id: str):
    delete_conversation(conversation_id)
    return {"success": True}


@app.patch("/api/conversations/{conversation_id}")
async def api_update_conversation(conversation_id: str, title: str):
    update_conversation_title(conversation_id, title)
    return {"success": True}


@app.get("/api/models")
async def list_models():
    """List available models."""
    return {
        "models": [
            {
                "id": model_id,
                "name": spec["name"],
                "description": spec["description"],
            }
            for model_id, spec in MODEL_SPECS.items()
        ]
    }


# Streaming endpoint
async def generate_stream_smooth(
    message: str,
    conversation_id: str,
    user_id: Optional[str],
    model_name: str,
    temperature: float,
    max_tokens: int,
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
        for token_text in generate_tokens_stream(
            message,
            model_name=model_name,
            temperature=temperature,
            max_new_tokens=max_tokens,
        ):
            full_response += token_text
            for char in token_text:
                yield f"data: {json.dumps({'content': char})}\n\n"
                await asyncio.sleep(0.008)

        # Save AI response to Supabase
        if conversation_id and user_id and full_response:
            save_message(conversation_id, "assistant", full_response)

        yield "data: [DONE]\n\n"

    except Exception as e:
        print(f"Streaming error: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    conversation_id = req.thread_id
    max_tokens = resolve_max_tokens(req.max_tokens)

    if not conversation_id and req.user_id:
        conv = create_conversation(req.user_id)
        conversation_id = conv["id"]

    async def stream_with_conv_id():
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
        async for chunk in generate_stream_smooth(
            message=req.message,
            conversation_id=conversation_id,
            user_id=req.user_id,
            model_name=req.model or "buddy",
            temperature=req.temperature or 0.6,
            max_tokens=max_tokens,
        ):
            yield chunk

    return StreamingResponse(
        stream_with_conv_id(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        conversation_id = req.thread_id
        max_tokens = resolve_max_tokens(req.max_tokens)

        if not conversation_id and req.user_id:
            conv = create_conversation(req.user_id)
            conversation_id = conv["id"]

        if conversation_id and req.user_id:
            save_message(conversation_id, "user", req.message)

        reply = generate_response(
            req.message,
            model_name=req.model or "buddy",
            temperature=req.temperature or 0.6,
            max_new_tokens=max_tokens,
        )

        if conversation_id and req.user_id:
            save_message(conversation_id, "assistant", reply)

        return ChatResponse(reply=reply, thread_id=conversation_id or "guest")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "loaded_models": list(models.keys()),
        "available_models": list(MODEL_SPECS.keys()),
        "device": device,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
