"use client";

import { useState, useRef, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import StartScreen from "@/components/StartScreen";
import ChatView from "@/components/ChatView";
import InputBar from "@/components/InputBar";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Chat {
  threadId: string;
  title: string;
  messages: Message[];
  systemPrompt?: string;
}

const PRESETS = [
  { id: "fitness", name: "Fitness Coach", icon: "💪", color: "#dc2626", prompt: "You are an expert fitness coach. Help users with workout plans, exercise form, nutrition for fitness goals, and motivation." },
  { id: "finance", name: "Personal Finance Advisor", icon: "💰", color: "#7c3aed", prompt: "You are a personal finance advisor. Help users with budgeting, saving, investing, debt management, and financial planning." },
  { id: "growth", name: "Growth Hacker", icon: "📈", color: "#16a34a", prompt: "You are a growth hacking expert. Help users with marketing strategies, user acquisition, conversion optimization, and scaling businesses." },
  { id: "webdev", name: "Web Development Expert", icon: "</>", color: "#2563eb", prompt: "You are a senior web development expert. Help users with HTML, CSS, JavaScript, React, Node.js, databases, and APIs." },
  { id: "nutrition", name: "Nutritionist", icon: "🍎", color: "#ea580c", prompt: "You are a professional nutritionist. Help users with meal planning, dietary advice, and achieving health goals through food." },
  { id: "language", name: "Language Tutor", icon: "🗣️", color: "#0d9488", prompt: "You are an expert language tutor. Help users learn new languages with grammar, vocabulary, pronunciation tips, and conversational practice." },
  { id: "relationship", name: "Relationship Counselor", icon: "❤️", color: "#db2777", prompt: "You are a compassionate relationship counselor. Help users navigate relationships, communication issues, and conflict resolution." },
];

let threadCounter = 1;

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.threadId === activeChatId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages]);

  function createNewChat(title?: string, systemPrompt?: string) {
    const threadId = String(threadCounter++);
    const newChat: Chat = {
      threadId,
      title: title || "New Chat",
      messages: [],
      systemPrompt: systemPrompt || "",
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(threadId);
    return threadId;
  }

  function handlePresetClick(preset: (typeof PRESETS)[0]) {
    createNewChat(preset.name, preset.prompt);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    let threadId = activeChatId;

    // If no active chat, create one
    if (!threadId) {
      threadId = createNewChat(text.slice(0, 40));
    }

    // Add user message
    const userMsg: Message = { role: "user", content: text };
    setChats((prev) =>
      prev.map((c) =>
        c.threadId === threadId
          ? { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? text.slice(0, 40) : c.title }
          : c
      )
    );

    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, thread_id: threadId }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();
      const aiMsg: Message = { role: "assistant", content: data.reply };

      setChats((prev) =>
        prev.map((c) =>
          c.threadId === threadId ? { ...c, messages: [...c.messages, aiMsg] } : c
        )
      );
    } catch {
      const errMsg: Message = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
      setChats((prev) =>
        prev.map((c) =>
          c.threadId === threadId ? { ...c, messages: [...c.messages, errMsg] } : c
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function deleteChat(threadId: string) {
    setChats((prev) => prev.filter((c) => c.threadId !== threadId));
    if (activeChatId === threadId) setActiveChatId(null);
  }

  const isConversation = activeChat && activeChat.messages.length > 0;

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={() => createNewChat()}
        onDeleteChat={deleteChat}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <div className="main">
        <div className="main-header">
          <div className="main-header-title">
            {activeChat ? activeChat.title : "New Chat"}
          </div>
          <div className="main-header-status">
            <div className="status-dot" />
            Not Sync
          </div>
        </div>

        <div className="main-body">
          {!isConversation ? (
            <StartScreen presets={PRESETS} onPresetClick={handlePresetClick} />
          ) : (
            <ChatView
              messages={activeChat.messages}
              loading={loading}
              messagesEndRef={messagesEndRef}
            />
          )}
        </div>

        <InputBar onSend={sendMessage} disabled={loading} />
      </div>
    </div>
  );
}
