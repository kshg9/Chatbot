export type MessageRole = 'user' | 'assistant';

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface StoredConversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AppSettings {
  model: string;
  temperature: number;
  theme: 'light' | 'dark' | 'system';
}

export interface AppSnapshot {
  conversations: ConversationSummary[];
  selectedConversation: StoredConversation | null;
  settings: AppSettings;
}
