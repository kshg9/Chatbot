import os
import json
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator, List
from supabase import create_client, Client
from langchain_core.messages import HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from datetime import datetime
import uuid

load_dotenv()

# Supabase setup
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://dahtshitjyjxypcwudge.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhaHRzaGl0anlqeHlwY3d1ZGdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4MDY3NSwiZXhwIjoyMDg2MzU2Njc1fQ.BO6N8TvXR4Zx9gehecX6o_zMh8_fZq02cerchuPtUIo")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Chatbot API")

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
    model: Optional[str] = "gemini-2.5-flash"
    temperature: Optional[float] = 0.7

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
    """Fetch all messages for a conversation from Supabase."""
    try:
        result = supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return []

def save_message(conversation_id: str, role: str, content: str) -> dict:
    """Save a message to Supabase."""
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
    """Create a new conversation in Supabase."""
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
    """Update conversation title in Supabase."""
    try:
        supabase.table("conversations").update({
            "title": title,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error updating conversation: {e}")

def get_user_conversations(user_id: str) -> List[dict]:
    """Get all conversations for a user."""
    try:
        result = supabase.table("conversations").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        return []

def delete_conversation(conversation_id: str):
    """Delete a conversation and its messages."""
    try:
        supabase.table("messages").delete().eq("conversation_id", conversation_id).execute()
        supabase.table("conversations").delete().eq("id", conversation_id).execute()
    except Exception as e:
        print(f"Error deleting conversation: {e}")


# ============ API Routes ============

@app.post("/api/conversations")
async def api_create_conversation(req: ConversationCreate):
    """Create a new conversation."""
    conv = create_conversation(req.user_id, req.title)
    return conv

@app.get("/api/conversations/{user_id}")
async def api_get_conversations(user_id: str):
    """Get all conversations for a user."""
    conversations = get_user_conversations(user_id)
    return {"conversations": conversations}

@app.get("/api/conversations/{conversation_id}/messages")
async def api_get_messages(conversation_id: str):
    """Get all messages for a conversation."""
    messages = get_conversation_messages(conversation_id)
    return {"messages": messages}

@app.delete("/api/conversations/{conversation_id}")
async def api_delete_conversation(conversation_id: str):
    """Delete a conversation."""
    delete_conversation(conversation_id)
    return {"success": True}

@app.patch("/api/conversations/{conversation_id}")
async def api_update_conversation(conversation_id: str, title: str):
    """Update conversation title."""
    update_conversation_title(conversation_id, title)
    return {"success": True}


# Smooth streaming with character-by-character output
async def generate_stream_smooth(
    message: str, 
    conversation_id: str, 
    user_id: Optional[str],
    model: str, 
    temperature: float
) -> AsyncGenerator[str, None]:
    """Generate smooth streaming response from LLM with character-by-character output."""
    full_response = ""
    
    try:
        # Get conversation history from Supabase
        history_messages = []
        if conversation_id:
            db_messages = get_conversation_messages(conversation_id)
            for msg in db_messages:
                if msg["role"] == "user":
                    history_messages.append(HumanMessage(content=msg["content"]))
                else:
                    history_messages.append(AIMessage(content=msg["content"]))
        
        # Add current message to history
        history_messages.append(HumanMessage(content=message))
        
        # Save user message to Supabase
        if conversation_id and user_id:
            save_message(conversation_id, "user", message)
            
            # Update conversation title if first message
            if len(db_messages) == 0:
                title = message[:50] + ("..." if len(message) > 50 else "")
                update_conversation_title(conversation_id, title)
        
        # Create LLM with specified model and temperature
        streaming_llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            streaming=True
        )
        
        # Stream the response with smooth character-by-character output
        buffer = ""
        async for chunk in streaming_llm.astream(history_messages):
            if hasattr(chunk, 'content') and chunk.content:
                buffer += chunk.content
                full_response += chunk.content
                
                # Send characters one by one for smooth typing effect
                for char in chunk.content:
                    yield f"data: {json.dumps({'content': char})}\n\n"
                    # Small delay for smooth typing effect
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
    """Streaming chat endpoint with smooth character-by-character output."""
    conversation_id = req.thread_id
    
    # Create new conversation if needed
    if not conversation_id and req.user_id:
        conv = create_conversation(req.user_id)
        conversation_id = conv["id"]
    
    async def stream_with_conv_id():
        # First send the conversation ID
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
        
        # Then stream the response
        async for chunk in generate_stream_smooth(
            message=req.message,
            conversation_id=conversation_id,
            user_id=req.user_id,
            model=req.model or "gemini-2.5-flash",
            temperature=req.temperature or 0.7
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


# Non-streaming route (for fallback)
@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Non-streaming chat endpoint."""
    try:
        conversation_id = req.thread_id
        
        if not conversation_id and req.user_id:
            conv = create_conversation(req.user_id)
            conversation_id = conv["id"]
        
        # Get history
        history_messages = []
        if conversation_id:
            db_messages = get_conversation_messages(conversation_id)
            for msg in db_messages:
                if msg["role"] == "user":
                    history_messages.append(HumanMessage(content=msg["content"]))
                else:
                    history_messages.append(AIMessage(content=msg["content"]))
        
        history_messages.append(HumanMessage(content=req.message))
        
        # Save user message
        if conversation_id and req.user_id:
            save_message(conversation_id, "user", req.message)
        
        llm = ChatGoogleGenerativeAI(
            model=req.model or "gemini-2.5-flash",
            temperature=req.temperature or 0.7
        )
        
        response = llm.invoke(history_messages)
        reply = response.content
        
        # Save AI response
        if conversation_id and req.user_id:
            save_message(conversation_id, "assistant", reply)
        
        return ChatResponse(reply=reply, thread_id=conversation_id or "guest")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
