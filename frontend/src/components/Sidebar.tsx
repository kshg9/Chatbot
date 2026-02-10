"use client";

import { Chat } from "@/app/page";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const filtered = chats.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinned = filtered.slice(0, 2);
  const allChats = filtered.slice(2);

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="icon">💬</span>
          Chats
        </div>
        <button className="new-chat-btn" onClick={onNewChat}>
          <span>■</span> New
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search or 🔍..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <>
          <div className="sidebar-section-label">Pinned</div>
          <div className="chat-list">
            {pinned.map((chat) => (
              <div
                key={chat.threadId}
                className={`chat-item ${activeChatId === chat.threadId ? "active" : ""}`}
                onClick={() => onSelectChat(chat.threadId)}
              >
                <div className="chat-item-dot" />
                <div className="chat-item-content">
                  <div className="chat-item-title">{chat.title}</div>
                  <div className="chat-item-preview">
                    {chat.messages.length > 0
                      ? chat.messages[chat.messages.length - 1].content.slice(0, 40) + "..."
                      : "No messages yet"}
                  </div>
                </div>
                <div className="chat-item-actions">
                  <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.threadId); }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* All Chats */}
      <div className="sidebar-section-label">All Chats</div>
      <div className="chat-list" style={{ flex: 1 }}>
        {allChats.length === 0 && pinned.length === 0 && (
          <div style={{ padding: "12px", color: "var(--text-muted)", fontSize: "13px", textAlign: "center" }}>
            No chats yet. Click &quot;New&quot; to start!
          </div>
        )}
        {allChats.map((chat) => (
          <div
            key={chat.threadId}
            className={`chat-item ${activeChatId === chat.threadId ? "active" : ""}`}
            onClick={() => onSelectChat(chat.threadId)}
          >
            <div className="chat-item-dot" style={{ background: "var(--text-muted)" }} />
            <div className="chat-item-content">
              <div className="chat-item-title">{chat.title}</div>
              <div className="chat-item-preview">
                {chat.messages.length > 0
                  ? chat.messages[chat.messages.length - 1].content.slice(0, 40) + "..."
                  : "No messages yet"}
              </div>
            </div>
            <div className="chat-item-actions">
              <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.threadId); }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="avatar">U</div>
        <div className="sidebar-footer-info">
          <div className="sidebar-footer-name">User</div>
          <div className="sidebar-footer-email">user@example.com</div>
        </div>
      </div>
    </aside>
  );
}
