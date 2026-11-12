'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi, clearSession, loadStoredUser, saveSession, type User } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Restore the session from localStorage, then verify it against the backend.
  useEffect(() => {
    const stored = loadStoredUser();
    if (!stored) {
      setLoading(false);
      return;
    }
    setUser(stored);
    authApi
      .me()
      .then((fresh) => {
        setUser(fresh);
        const token = window.localStorage.getItem('5sim_token');
        if (token) saveSession(fresh, token);
      })
      .catch(() => {
        // api() already cleared the session + redirected on 401.
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    saveSession(res.user, res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await authApi.register({ email, password, displayName: displayName || undefined });
    saveSession(res.user, res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

/**
 * Client-side auth guard: redirects unauthenticated users to /login.
 * Returns the current user once loaded, or null while redirecting.
 * Public paths (/login, /register) are exempt.
 */
export function useRequireAuth(): { user: User | null; loading: boolean } {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }
  }, [loading, user, pathname, router]);

  return { user, loading };
}

/** Guard for admin-only pages: non-admins are sent back to the dashboard. */
export function useRequireAdmin(): { user: User | null; loading: boolean } {
  const { user, loading } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  return { user, loading };
}
