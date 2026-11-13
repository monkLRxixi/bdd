import { create } from "zustand";

import { api, errorText } from "@/lib/api";
import type { UserInfo } from "@/lib/types";

interface AuthStore {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const user = await api.loginState();
      set({ user: user.isLogin ? user : null, loading: false });
    } catch (error) {
      set({ user: null, loading: false });
      console.error(errorText(error));
    }
  },

  setUser: (user) => set({ user, loading: false }),

  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
