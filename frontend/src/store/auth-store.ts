import { create } from 'zustand';

interface AuthStore {
  user: { id: string; email: string; created_at: string } | null;
  loading: boolean;
  setUser: (user: { id: string; email: string; created_at: string } | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  signIn: async (...args) => {
    const [email] = args;
    return { error: new Error(`Offline mode: sign-in is disabled for ${email}.`) };
  },

  signUp: async (...args) => {
    const [email, , fullName] = args;
    return { error: new Error(`Offline mode: sign-up is disabled for ${email}${fullName ? ` (${fullName})` : ''}.`) };
  },

  signOut: async () => {
    set({ user: null });
  },

  initialize: async () => {
    set({
      user: {
        id: 'local-user',
        email: 'offline@local',
        created_at: new Date().toISOString(),
      },
      loading: false,
    });
  },
}));
