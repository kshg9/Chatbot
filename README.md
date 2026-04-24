# AI Chatbot - Premium Web Application

A modern, premium AI chatbot web application built with Next.js 15, Tailwind CSS, and FastAPI backend with streaming support.

## Features

### Frontend
- 🎨 Modern, minimal, premium design
- 🌙 Dark/Light mode with system preference support
- 💬 Real-time streaming responses
- 📝 Markdown rendering with syntax highlighting
- 📎 File attachment support
- 🔍 Chat search functionality
- ✏️ Rename/Delete conversations
- ⚙️ Settings modal with model selection
- 📱 Fully responsive design
- 🔐 Supabase authentication

### Backend
- ⚡ FastAPI with streaming support
- 🧠 LangGraph for conversation management
- 💾 Memory persistence with checkpointing

## Tech Stack

### Frontend
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion (Animations)
- Zustand (State Management)
- Supabase (Authentication & Database)
- React Markdown + Syntax Highlighter

### Backend
- FastAPI
- LangChain + LangGraph
- Google Gemini AI
- Server-Sent Events (SSE) for streaming

## Getting Started

## Repo Size + Reproducibility

- Model checkpoints and tokenizers are intentionally ignored by git.
- Use this command to fetch NanoChat model files locally:

```bash
python backend/download_nanochat.py
```

- This creates:
  - `model/model_000650.pt`
  - `model/nanochat/meta_000650.json`
  - `model/nanochat/tokenizer.pkl`

### Prerequisites
- Node.js 18+
- Python 3.9+
- Google API Key for Gemini
- Supabase account

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key
```
You can copy from `backend/.env.example`.

5. Start the backend server:
```bash
uvicorn main:app --reload --port 8000
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `frontend/.env.local` locally from `frontend/.env.local.example` (do not commit it).

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Supabase Setup

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the SQL from `supabase-schema.sql` to create tables and policies
4. Enable Email authentication in **Authentication > Providers**

## Project Structure

```
Project/
├── backend/
│   ├── main.py              # FastAPI server with streaming
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js pages
│   │   ├── components/     # React components
│   │   │   ├── chat/       # Chat-related components
│   │   │   ├── auth/       # Authentication components
│   │   │   └── ui/         # UI primitives
│   │   ├── lib/            # Utilities
│   │   └── store/          # Zustand stores
│   └── .env.local          # Environment variables
└── supabase-schema.sql     # Database schema
```

## API Endpoints

### Backend

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Non-streaming chat endpoint |
| POST | `/api/chat/stream` | Streaming chat endpoint (SSE) |
| GET | `/health` | Health check |

### Request Body
```json
{
  "message": "Hello, AI!",
  "thread_id": "unique-chat-id",
  "model": "gemini-2.5-flash",
  "temperature": 0.7
}
```

## Customization

### Adding New Models
Edit `settings-modal.tsx` to add more model options:
```tsx
<option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
```

### Changing Theme Colors
Edit `globals.css` to customize the color palette:
```css
:root {
  --primary: #6366f1;
  /* ... */
}
```

## License

MIT License
