'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  MessageSquarePlus,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings,
  Trash2,
  Edit3,
  Check,
  X,
  LogOut,
  LogIn,
  User,
  MessageCircle,
} from 'lucide-react';
import { useChatStore, type Chat } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';
import { cn, formatDate, truncateText } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SidebarProps {
  onSettingsClick: () => void;
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const router = useRouter();
  const {
    chats,
    currentChatId,
    sidebarOpen,
    toggleSidebar,
    createChat,
    deleteChat,
    renameChat,
    setCurrentChat,
  } = useChatStore();

  const { user, signOut } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredChats = chats.filter((chat: Chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewChat = () => {
    createChat();
  };

  const handleStartEdit = (chat: Chat) => {
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveEdit = (chatId: string) => {
    if (editTitle.trim()) {
      renameChat(chatId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // Group chats by date
  const groupedChats = filteredChats.reduce((groups: Record<string, Chat[]>, chat: Chat) => {
    const dateKey = formatDate(chat.updatedAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(chat);
    return groups;
  }, {} as Record<string, Chat[]>);

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarOpen ? 280 : 0,
          opacity: sidebarOpen ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'fixed lg:relative z-50 h-full flex flex-col bg-card border-r border-border overflow-hidden',
          sidebarOpen ? 'shadow-xl lg:shadow-none' : ''
        )}
      >
        <div className="flex flex-col h-full w-[280px]">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <Button
              onClick={handleNewChat}
              className="w-full justify-start gap-2"
              variant="default"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </Button>
          </div>

          {/* Search */}
          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Chat list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {(Object.entries(groupedChats) as [string, Chat[]][]).map(([date, dateChats]) => (
              <div key={date} className="mb-4">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {date}
                </div>
                <div className="space-y-1">
                  {dateChats.map((chat: Chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200',
                        currentChatId === chat.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-secondary'
                      )}
                      onClick={() => setCurrentChat(chat.id)}
                    >
                      {editingId === chat.id ? (
                        <div className="flex-1 flex items-center gap-1">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(chat.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="h-7 text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEdit(chat.id);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm truncate">
                            {truncateText(chat.title, 25)}
                          </span>
                          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(chat);
                              }}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteChat(chat.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}

            {filteredChats.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <MessageSquarePlus className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No chats found' : 'No conversations yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery ? 'Try a different search term' : 'Start a new chat to begin'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border space-y-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11"
              onClick={onSettingsClick}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>

            {user ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                  onClick={signOut}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <p className="text-xs text-muted-foreground text-center px-2">
                  Sign in to save your chats
                </p>
                <Button
                  className="w-full gap-2"
                  onClick={() => router.push('/signin')}
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Toggle button */}
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          'fixed lg:absolute z-50 top-4 transition-all duration-300',
          sidebarOpen ? 'left-[292px]' : 'left-4'
        )}
        onClick={toggleSidebar}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
