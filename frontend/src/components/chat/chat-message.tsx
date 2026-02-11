'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  User,
  Sparkles,
} from 'lucide-react';
import { type ChatMessage as ChatMessageType } from '@/store/chat-store';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  message: ChatMessageType;
  onRegenerate?: () => void;
  isDark?: boolean;
}

export function ChatMessage({ message, onRegenerate, isDark = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);

  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: 'like' | 'dislike') => {
    setFeedback(feedback === type ? null : type);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group flex gap-4 px-4 md:px-6 py-5 md:py-6 transition-colors duration-200',
        isUser ? 'bg-transparent' : 'bg-secondary/20 hover:bg-secondary/30'
      )}
    >
      {/* Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className={cn(
          'shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shadow-sm',
          isUser 
            ? 'bg-gradient-to-br from-blue-500 to-cyan-500' 
            : 'bg-gradient-to-br from-primary via-purple-500 to-pink-500'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
      </motion.div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            {isUser ? 'You' : 'AI Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* Message content with streaming cursor */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.isStreaming ? (
            <div className="text-foreground">
              {message.content}
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  
                  if (match) {
                    return (
                      <div className="relative group/code my-4">
                        <div className="flex items-center justify-between px-4 py-2 bg-secondary rounded-t-xl border-b border-border">
                          <span className="text-xs font-medium text-muted-foreground">
                            {match[1]}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={async () => {
                              await navigator.clipboard.writeText(codeString);
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <SyntaxHighlighter
                          style={isDark ? oneDark : oneLight}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderBottomLeftRadius: '12px',
                            borderBottomRightRadius: '12px',
                          }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }

                  return (
                    <code className={cn('bg-secondary px-1.5 py-0.5 rounded text-sm', className)} {...props}>
                      {children}
                    </code>
                  );
                },
                p({ children }) {
                  return <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>;
                },
                ul({ children }) {
                  return <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {children}
                    </a>
                  );
                },
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
                      {children}
                    </blockquote>
                  );
                },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border border-border rounded-xl overflow-hidden">
                        {children}
                      </table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="px-4 py-2 bg-secondary text-left font-medium">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="px-4 py-2 border-t border-border">
                      {children}
                    </td>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Action buttons for AI messages */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 pt-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            {onRegenerate && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onRegenerate}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-8 w-8', feedback === 'like' && 'text-green-500')}
              onClick={() => handleFeedback('like')}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-8 w-8', feedback === 'dislike' && 'text-red-500')}
              onClick={() => handleFeedback('dislike')}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Typing indicator component
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-4 px-4 md:px-6 py-5 md:py-6 bg-secondary/20"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br from-primary via-purple-500 to-pink-500"
      >
        <Sparkles className="h-4 w-4 text-white" />
      </motion.div>
      <div className="flex items-center gap-1.5 py-2">
        <motion.div 
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          className="w-2 h-2 rounded-full bg-primary/60" 
        />
        <motion.div 
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
          className="w-2 h-2 rounded-full bg-primary/60" 
        />
        <motion.div 
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
          className="w-2 h-2 rounded-full bg-primary/60" 
        />
      </div>
    </motion.div>
  );
}
