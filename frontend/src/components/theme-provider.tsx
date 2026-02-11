'use client';

import { useEffect, useState } from 'react';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Get theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(savedTheme);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'system';
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export function applyTheme(theme: string) {
  const root = document.documentElement;
  
  if (theme === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', systemDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
  
  localStorage.setItem('theme', theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>('system');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setThemeState(savedTheme);
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  };

  return { theme, setTheme };
}
