'use client';

import { useEffect } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { useAuthStore } from '@/store/auth-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <ThemeProvider>{children}</ThemeProvider>;
}
