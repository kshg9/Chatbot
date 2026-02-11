'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isGenerating }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isGenerating) {
        handleSend();
      }
    }
  };

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-xl">
      {/* Input area */}
      <div className="p-4">
        <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              disabled={disabled}
              rows={1}
              className={cn(
                'w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 pr-24 text-sm',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring transition-all duration-200',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'min-h-[48px] max-h-[200px]'
              )}
            />


          </div>

          {/* Send/Stop button */}
          {isGenerating ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-12 w-12 rounded-xl flex-shrink-0"
              onClick={onStop}
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="default"
              className="h-12 w-12 rounded-xl shrink-0"
              onClick={handleSend}
              disabled={disabled || !message.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Helper text */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}
