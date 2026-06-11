import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getStoredUser, removeUser, storeUser, type User } from '../services/auth';
import { setCurrentUserId } from '../services/storage';
import { refreshLocale } from '../services/i18n';
import { refreshTextSize } from '../services/textScale';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = getStoredUser();
      setCurrentUserId(stored?.id ?? null);
      refreshLocale();
      refreshTextSize(); // Locale lives in per-user settings — re-read after user ID set
      setUser(stored);
    } catch {
      setCurrentUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback((u: User) => {
    setCurrentUserId(u.id);
    refreshLocale();
    storeUser(u);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    removeUser();
    setCurrentUserId(null);
    refreshLocale();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
