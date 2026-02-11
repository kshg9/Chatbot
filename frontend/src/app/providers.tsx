'use client';

import { useEffect } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const { initialize, user } = useAuthStore();
  const { loadChatsFromServer, setUserId } = useChatStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      setUserId(user.id);
      loadChatsFromServer();
    } else {
      setUserId(null);
    }
  }, [user, setUserId, loadChatsFromServer]);

  return <ThemeProvider>{children}</ThemeProvider>;
}
