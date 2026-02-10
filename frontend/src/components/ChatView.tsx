"use client";

import { Message } from "@/app/page";
import { RefObject } from "react";
import ReactMarkdown from "react-markdown";

interface ChatViewProps {
  messages: Message[];
  loading: boolean;
  messagesEndRef: RefObject<HTMLDivElement>;
}

export default function ChatView({ messages, loading, messagesEndRef }: ChatViewProps) {
  return (
    <div className="messages-container">
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.role}`}>
          {msg.role === "assistant" ? (
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          ) : (
            msg.content
          )}
        </div>
      ))}

      {loading && (
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
