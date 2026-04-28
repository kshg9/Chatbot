'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, MessageSquarePlus, Send, Settings2, Trash2 } from 'lucide-react';

import {
  clearAllConversationsAction,
  createConversationAction,
  deleteConversationAction,
  renameConversationAction,
  selectConversationAction,
  sendMessageAction,
  updateSettingsAction,
} from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate, formatTime } from '@/lib/utils';
import type {
  AppSettings,
  ConversationSummary,
  StoredConversation,
  StoredMessage,
} from '@/lib/offline-types';

interface OfflineChatAppProps {
  initialConversations: ConversationSummary[];
  initialConversation: StoredConversation | null;
  initialSettings: AppSettings;
}

function makePendingConversation(message: string, model: string): StoredConversation {
  const now = new Date().toISOString();
  return {
    id: 'pending',
    title: message.length > 48 ? `${message.slice(0, 48)}...` : message,
    model,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: 'pending-user',
        conversationId: 'pending',
        role: 'user',
        content: message,
        createdAt: now,
      },
      {
        id: 'pending-assistant',
        conversationId: 'pending',
        role: 'assistant',
        content: '',
        createdAt: now,
      },
    ],
  };
}

export function OfflineChatApp({
  initialConversations,
  initialConversation,
  initialSettings,
}: OfflineChatAppProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedConversation, setSelectedConversation] = useState(initialConversation);
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>('Offline mode. Chats are stored in SQLite on this machine.');

  const selectedConversationId = selectedConversation?.id || null;
  const orderedMessages = selectedConversation?.messages || [];

  const groupedConversations = useMemo(() => {
    const groups = new Map<string, ConversationSummary[]>();
    for (const item of conversations) {
      const label = formatDate(item.updatedAt);
      const existing = groups.get(label) || [];
      existing.push(item);
      groups.set(label, existing);
    }
    return Array.from(groups.entries());
  }, [conversations]);

  const refreshSnapshot = async (conversationId: string | null) => {
    const snapshot = await selectConversationAction(conversationId);
    setConversations(snapshot.conversations);
    setSelectedConversation(snapshot.selectedConversation);
    setSettings(snapshot.settings);
  };

  const handleSend = () => {
    const message = draft.trim();
    if (!message || isPending) {
      return;
    }

    setDraft('');
    setStatus(`Running ${settings.model} locally...`);
    setSelectedConversation((current) => {
      if (current) {
        const now = new Date().toISOString();
        return {
          ...current,
          messages: [
            ...current.messages,
            {
              id: `local-user-${now}`,
              conversationId: current.id,
              role: 'user',
              content: message,
              createdAt: now,
            },
            {
              id: `local-assistant-${now}`,
              conversationId: current.id,
              role: 'assistant',
              content: '',
              createdAt: now,
            },
          ],
          updatedAt: now,
        };
      }
      return makePendingConversation(message, settings.model);
    });

    startTransition(async () => {
      try {
        const conversation = await sendMessageAction({
          conversationId: selectedConversationId,
          message,
          model: settings.model,
          temperature: settings.temperature,
        });
        await refreshSnapshot(conversation.id);
        setStatus(`${conversation.model} replied. SQLite and model runtime are local only.`);
      } catch (error) {
        setStatus((error as Error).message);
        await refreshSnapshot(selectedConversationId);
      }
    });
  };

  const handleSelectConversation = (conversationId: string) => {
    if (conversationId === selectedConversationId || isPending) {
      return;
    }

    startTransition(async () => {
      setStatus('Loading local conversation...');
      await refreshSnapshot(conversationId);
      setStatus('Conversation loaded from SQLite.');
    });
  };

  const handleNewChat = () => {
    startTransition(async () => {
      const conversation = await createConversationAction(settings.model);
      await refreshSnapshot(conversation.id);
      setStatus('Created a new local conversation.');
    });
  };

  const handleRename = (conversationId: string) => {
    const title = renamingValue.trim();
    if (!title) {
      return;
    }

    startTransition(async () => {
      await renameConversationAction(conversationId, title);
      await refreshSnapshot(conversationId);
      setRenamingId(null);
      setRenamingValue('');
      setStatus('Conversation renamed.');
    });
  };

  const handleDelete = (conversationId: string) => {
    startTransition(async () => {
      await deleteConversationAction(conversationId);
      await refreshSnapshot(null);
      setStatus('Conversation deleted from SQLite.');
    });
  };

  const handleClearAll = () => {
    startTransition(async () => {
      await clearAllConversationsAction();
      setConversations([]);
      setSelectedConversation(null);
      setStatus('All local conversations were deleted.');
    });
  };

  const handleSettingChange = (next: Partial<AppSettings>) => {
    const optimistic = { ...settings, ...next };
    setSettings(optimistic);
    startTransition(async () => {
      const updated = await updateSettingsAction(next);
      setSettings(updated);
      if (selectedConversationId) {
        await refreshSnapshot(selectedConversationId);
      }
      setStatus('Offline settings updated.');
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(240,140,60,0.16),_transparent_28%),linear-gradient(180deg,_var(--background),_color-mix(in_srgb,var(--background)_85%,#d7e3f4_15%))] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-6 md:px-6">
        <aside className="hidden w-[320px] shrink-0 rounded-[28px] border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur lg:flex lg:flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Offline</p>
              <h1 className="text-2xl font-semibold">NanoChat Workbench</h1>
            </div>
            <Button size="icon" variant="outline" onClick={handleNewChat} disabled={isPending}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-4 rounded-2xl border border-border/70 bg-background/80 p-3 text-sm text-muted-foreground">
            <p>{status}</p>
          </div>

          <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-3">
            <label className="grid gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Settings2 className="h-4 w-4" />
                Model
              </span>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={settings.model}
                onChange={(event) => handleSettingChange({ model: event.target.value })}
                disabled={isPending}
              >
                <option value="nanochat">NanoChat</option>
                <option value="buddy">Innocent Buddy</option>
                <option value="story_creator">Story Creator</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">Temperature: {settings.temperature.toFixed(1)}</span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={settings.temperature}
                onChange={(event) => handleSettingChange({ temperature: Number(event.target.value) })}
                disabled={isPending}
              />
            </label>

            <Button variant="ghost" className="justify-start text-destructive" onClick={handleClearAll} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear all local data
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {groupedConversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No conversations yet. Start a chat and it will be stored in `frontend/.data/chatbot.db`.
              </div>
            ) : (
              groupedConversations.map(([label, items]) => (
                <div key={label} className="mb-4">
                  <div className="mb-2 px-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isSelected = item.id === selectedConversationId;
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'rounded-2xl border p-3 transition',
                            isSelected ? 'border-primary bg-primary/10' : 'border-border/70 bg-background/70 hover:bg-background'
                          )}
                        >
                          {renamingId === item.id ? (
                            <div className="flex gap-2">
                              <Input
                                value={renamingValue}
                                onChange={(event) => setRenamingValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    handleRename(item.id);
                                  }
                                }}
                              />
                              <Button size="sm" onClick={() => handleRename(item.id)} disabled={isPending}>
                                Save
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button className="w-full text-left" onClick={() => handleSelectConversation(item.id)}>
                                <div className="text-sm font-medium">{item.title}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.model} · {item.messageCount} messages
                                </div>
                              </button>
                              <div className="mt-3 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setRenamingId(item.id);
                                    setRenamingValue(item.title);
                                  }}
                                  disabled={isPending}
                                >
                                  Rename
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} disabled={isPending}>
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-3rem)] flex-1 flex-col rounded-[32px] border border-border/70 bg-card/80 shadow-sm backdrop-blur">
          <div className="border-b border-border/70 px-5 py-4 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Local SQLite + Python Runtime</p>
                <h2 className="text-2xl font-semibold">
                  {selectedConversation?.title || 'Start an offline chat'}
                </h2>
              </div>
              <div className="rounded-full border border-border/70 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                {settings.model} · temp {settings.temperature.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
            {orderedMessages.length === 0 ? (
              <div className="mx-auto max-w-3xl rounded-[28px] border border-dashed border-border/70 bg-background/50 p-8">
                <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Refactored offline mode</p>
                <h3 className="mt-3 text-3xl font-semibold">Everything runs on this machine.</h3>
                <p className="mt-4 max-w-2xl text-muted-foreground">
                  Next.js stores your conversations in SQLite, and the Python runtime loads the local checkpoints you
                  downloaded with `backend/download_nanochat.py`. There is no Supabase dependency and no FastAPI server
                  in this flow.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-6">
                {orderedMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {isPending && (
                  <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating on the local model runtime...
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/70 px-5 py-4 md:px-8">
            <div className="mx-auto flex max-w-3xl items-end gap-3">
              <textarea
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask the local model something..."
                className="min-h-[56px] flex-1 resize-none rounded-[24px] border border-input bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button className="h-14 w-14 rounded-2xl" onClick={handleSend} disabled={isPending || !draft.trim()}>
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: StoredMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-[26px] px-4 py-3 shadow-sm',
          isUser
            ? 'bg-[linear-gradient(135deg,#0f766e,#155e75)] text-white'
            : 'border border-border/70 bg-background/70 text-foreground'
        )}
      >
        <div className="mb-2 text-[11px] uppercase tracking-[0.24em] opacity-70">
          {isUser ? 'You' : 'Model'} · {formatTime(message.createdAt)}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-7">{message.content || '...'}</div>
      </div>
    </div>
  );
}
