'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sun,
  Moon,
  Monitor,
  Trash2,
  LogOut,
  User,
  Palette,
  Cpu,
} from 'lucide-react';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings, clearAllChats } = useChatStore();
  const { user, signOut } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'general' | 'model' | 'account'>('general');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  };

  const handleClearHistory = () => {
    clearAllChats();
    setShowClearConfirm(false);
    onClose();
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Palette },
    { id: 'model', label: 'Model', icon: Cpu },
    { id: 'account', label: 'Account', icon: User },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[80vh] bg-card rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-semibold">Settings</h2>
              <Button size="icon" variant="ghost" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar tabs */}
              <div className="w-48 border-r border-border p-4 space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'general' && (
                  <div className="space-y-6">
                    {/* Theme */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">Appearance</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'light', label: 'Light', icon: Sun },
                          { value: 'dark', label: 'Dark', icon: Moon },
                          { value: 'system', label: 'System', icon: Monitor },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleThemeChange(option.value as 'light' | 'dark' | 'system')}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200',
                              theme === option.value
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <option.icon className="h-5 w-5" />
                            <span className="text-sm">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clear history */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">Data</h3>
                      {showClearConfirm ? (
                        <div className="p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                          <p className="text-sm mb-4">
                            Are you sure you want to clear all chat history? This action cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleClearHistory}
                            >
                              Yes, clear all
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowClearConfirm(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                          onClick={() => setShowClearConfirm(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Clear chat history
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'model' && (
                  <div className="space-y-6">
                    {/* Model selector */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">Model</h3>
                      <div className="space-y-3">
                        {[
                          {
                            id: 'buddy',
                            name: 'Innocent Buddy',
                            description: 'Empathetic emotional companion',
                            emoji: '💛',
                          },
                          {
                            id: 'story_creator',
                            name: 'Story Creator',
                            description: 'Creative story generation',
                            emoji: '📖',
                          },
                          {
                            id: 'nanochat',
                            name: 'NanoChat',
                            description: 'NanoChat pretrained checkpoint',
                            emoji: 'N',
                          },
                        ].map((model) => (
                          <button
                            key={model.id}
                            onClick={() => updateSettings({ model: model.id })}
                            className={cn(
                              'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left',
                              settings.model === model.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                            )}
                          >
                            <span className="text-2xl">{model.emoji}</span>
                            <div>
                              <p className="font-medium text-sm">{model.name}</p>
                              <p className="text-xs text-muted-foreground">{model.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        All models run locally on your machine
                      </p>
                    </div>

                    {/* Temperature slider */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium">Temperature</h3>
                        <span className="text-sm text-muted-foreground">
                          {settings.temperature.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={settings.temperature}
                        onChange={(e) =>
                          updateSettings({ temperature: parseFloat(e.target.value) })
                        }
                        className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'account' && (
                  <div className="space-y-6">
                    {user ? (
                      <>
                        <div className="flex items-center gap-4 p-4 bg-secondary rounded-xl">
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{user.email}</p>
                            <p className="text-sm text-muted-foreground">
                              Member since {new Date(user.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                          onClick={signOut}
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </Button>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">
                          Sign in to sync your chats across devices
                        </p>
                        <Button
                          onClick={onClose}
                          className="gap-2"
                        >
                          Sign in
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
