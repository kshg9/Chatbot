import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface Settings {
  theme: 'light' | 'dark' | 'system';
  model: string;
  temperature: number;
}

interface ChatStore {
  // State
  chats: Chat[];
  currentChatId: string | null;
  isGenerating: boolean;
  sidebarOpen: boolean;
  settings: Settings;
  userId: string | null;
  isLoading: boolean;

  // Actions
  setUserId: (userId: string | null) => void;
  createChat: () => string;
  addChatFromServer: (chat: Chat) => void;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  setCurrentChat: (chatId: string | null) => void;
  addMessage: (chatId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (chatId: string, messageId: string, content: string) => void;
  appendToMessage: (chatId: string, messageId: string, content: string) => void;
  setMessageStreaming: (chatId: string, messageId: string, isStreaming: boolean) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  clearAllChats: () => Promise<void>;
  loadChatsFromServer: () => Promise<void>;
  loadChatMessages: (chatId: string) => Promise<void>;
  getCurrentChat: () => Chat | null;
  setChats: (chats: Chat[]) => void;
  updateChatId: (oldId: string, newId: string) => void;
  updateChatTitle: (chatId: string, title: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      chats: [],
      currentChatId: null,
      isGenerating: false,
      sidebarOpen: true,
      userId: null,
      isLoading: false,
      settings: {
        theme: 'system',
        model: 'nanochat',
        temperature: 0.6,
      },

      setUserId: (userId) => set({ userId }),

      createChat: () => {
        const tempId = `temp_${generateId()}`;
        const newChat: Chat = {
          id: tempId,
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({
          chats: [newChat, ...state.chats],
          currentChatId: tempId,
        }));
        return tempId;
      },

      addChatFromServer: (chat) => {
        set((state) => {
          // Check if chat already exists
          const exists = state.chats.some(c => c.id === chat.id);
          if (exists) return state;
          return {
            chats: [chat, ...state.chats],
          };
        });
      },

      updateChatId: (oldId, newId) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === oldId ? { ...c, id: newId } : c
          ),
          currentChatId: state.currentChatId === oldId ? newId : state.currentChatId,
        }));
      },

      updateChatTitle: (chatId, title) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, title, updatedAt: new Date() } : c
          ),
        }));
      },

      deleteChat: async (chatId) => {
        const state = get();
        const newChats = state.chats.filter((c) => c.id !== chatId);
        set({
          chats: newChats,
          currentChatId: state.currentChatId === chatId 
            ? (newChats[0]?.id || null) 
            : state.currentChatId,
        });
        
        // Delete from server
        if (state.userId && !chatId.startsWith('temp_')) {
          try {
            await fetch(`${API_URL}/api/conversations/${chatId}`, {
              method: 'DELETE',
            });
          } catch (error) {
            console.error('Error deleting chat:', error);
          }
        }
      },

      renameChat: async (chatId, title) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, title, updatedAt: new Date() } : c
          ),
        }));
        
        const state = get();
        if (state.userId && !chatId.startsWith('temp_')) {
          try {
            await fetch(`${API_URL}/api/conversations/${chatId}?title=${encodeURIComponent(title)}`, {
              method: 'PATCH',
            });
          } catch (error) {
            console.error('Error renaming chat:', error);
          }
        }
      },

      setCurrentChat: (chatId) => {
        set({ currentChatId: chatId });
        // Load messages if not already loaded
        if (!chatId) return;
        const state = get();
        const chat = state.chats.find(c => c.id === chatId);
        if (chat && chat.messages.length === 0 && state.userId && !chatId.startsWith('temp_')) {
          get().loadChatMessages(chatId);
        }
      },

      addMessage: (chatId, message) => {
        const messageId = generateId();
        const newMessage: ChatMessage = {
          ...message,
          id: messageId,
          timestamp: new Date(),
        };
        
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: [...c.messages, newMessage],
                  updatedAt: new Date(),
                }
              : c
          ),
        }));
        
        return messageId;
      },

      updateMessage: (chatId, messageId, content) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, content } : m
                  ),
                }
              : c
          ),
        }));
      },

      appendToMessage: (chatId, messageId, content) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, content: m.content + content } : m
                  ),
                }
              : c
          ),
        }));
      },

      setMessageStreaming: (chatId, messageId, isStreaming) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, isStreaming } : m
                  ),
                }
              : c
          ),
        }));
      },

      setIsGenerating: (isGenerating) => set({ isGenerating }),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      clearAllChats: async () => {
        const state = get();
        set({ chats: [], currentChatId: null });
        
        // Delete all from server
        if (state.userId) {
          for (const chat of state.chats) {
            if (!chat.id.startsWith('temp_')) {
              try {
                await fetch(`${API_URL}/api/conversations/${chat.id}`, {
                  method: 'DELETE',
                });
              } catch (error) {
                console.error('Error deleting chat:', error);
              }
            }
          }
        }
      },

      loadChatsFromServer: async () => {
        const state = get();
        if (!state.userId) return;

        set({ isLoading: true });
        
        try {
          const response = await fetch(`${API_URL}/api/conversations/${state.userId}`);
          if (!response.ok) throw new Error('Failed to fetch conversations');
          
          const data = await response.json();
          const conversations = data.conversations || [];
          
          const chats: Chat[] = conversations.map((conv: { id: string; title: string; created_at: string; updated_at: string }) => ({
            id: conv.id,
            title: conv.title || 'New Chat',
            messages: [],
            createdAt: new Date(conv.created_at),
            updatedAt: new Date(conv.updated_at),
          }));
          
          set({ chats, isLoading: false });
        } catch (error) {
          console.error('Error loading chats:', error);
          set({ isLoading: false });
        }
      },

      loadChatMessages: async (chatId) => {
        try {
          const response = await fetch(`${API_URL}/api/conversations/${chatId}/messages`);
          if (!response.ok) throw new Error('Failed to fetch messages');
          
          const data = await response.json();
          const messages = (data.messages || []).map((m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at),
          }));
          
          set((state) => ({
            chats: state.chats.map((c) =>
              c.id === chatId ? { ...c, messages } : c
            ),
          }));
        } catch (error) {
          console.error('Error loading messages:', error);
        }
      },

      getCurrentChat: () => {
        const state = get();
        return state.chats.find((c) => c.id === state.currentChatId) || null;
      },

      setChats: (chats) => set({ chats }),
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        settings: state.settings,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
