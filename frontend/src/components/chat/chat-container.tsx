'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';
import { Sidebar } from './sidebar';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';
import { SettingsModal } from '@/components/settings-modal';
import { Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function ChatContainer() {
  const {
    chats,
    currentChatId,
    isGenerating,
    isLoading,
    settings,
    createChat,
    addMessage,
    appendToMessage,
    setMessageStreaming,
    setIsGenerating,
    setUserId,
    loadChatsFromServer,
    updateChatId,
    updateChatTitle,
  } = useChatStore();

  const { user } = useAuthStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const currentChat = chats.find((c) => c.id === currentChatId);

  // Set user ID when auth changes and load chats
  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadChatsFromServer();
    } else {
      setUserId(null);
    }
  }, [user?.id, setUserId, loadChatsFromServer]);

  // Smooth scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [currentChat?.messages]);

  const sendMessage = async (message: string) => {
    let chatId: string = currentChatId || '';
    const isNewChat = !currentChatId || currentChatId.startsWith('temp_');

    // Create new temp chat if none exists
    if (!currentChatId) {
      chatId = createChat();
    }

    // Add user message locally
    addMessage(chatId, { role: 'user', content: message });

    // Add empty assistant message for streaming
    const assistantMessageId = addMessage(chatId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    setIsGenerating(true);

    // Create abort controller for stopping generation
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          thread_id: isNewChat ? null : chatId,
          user_id: user?.id || null,
          model: settings.model,
          temperature: settings.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                
                // Handle conversation ID from server
                if (parsed.conversation_id && isNewChat) {
                  updateChatId(chatId, parsed.conversation_id);
                  chatId = parsed.conversation_id;
                  
                  // Update title with first part of message
                  const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
                  updateChatTitle(chatId, title);
                }
                
                // Handle content chunks - append character by character
                if (parsed.content) {
                  appendToMessage(chatId, assistantMessageId, parsed.content);
                }
                
                // Handle errors
                if (parsed.error) {
                  console.error('Stream error:', parsed.error);
                  appendToMessage(
                    chatId,
                    assistantMessageId,
                    `\n\n[Error: ${parsed.error}]`
                  );
                  setMessageStreaming(chatId, assistantMessageId, false);
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      setMessageStreaming(chatId, assistantMessageId, false);

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User stopped generation
        setMessageStreaming(chatId, assistantMessageId, false);
      } else {
        console.error('Error sending message:', error);
        appendToMessage(
          chatId,
          assistantMessageId,
          'Sorry, there was an error processing your request. Please try again.'
        );
        setMessageStreaming(chatId, assistantMessageId, false);
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const stopGeneration = () => {
    abortController?.abort();
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleRegenerate = async (messageIndex: number) => {
    if (!currentChat || messageIndex < 1) return;

    // Get the user message before this assistant message
    const userMessage = currentChat.messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    // Resend the user message
    sendMessage(userMessage.content);
  };

  // Check if dark mode is active
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar onSettingsClick={() => setSettingsOpen(true)} />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Loading overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading your chats...</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <AnimatePresence mode="wait">
            {currentChat && currentChat.messages.length > 0 ? (
              <motion.div
                key={currentChat.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto pb-4"
              >
                {currentChat.messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isDark={isDark}
                    modelName={settings.model}
                    onRegenerate={
                      message.role === 'assistant' && !message.isStreaming
                        ? () => handleRegenerate(index)
                        : undefined
                    }
                  />
                ))}
                <div ref={messagesEndRef} className="h-4" />
              </motion.div>
            ) : (
              <EmptyState onSuggestionClick={handleSuggestionClick} />
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          disabled={false}
          isGenerating={isGenerating}
        />
      </main>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
