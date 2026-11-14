import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '@/components/common/feedback';
import { redirectFromState } from '@/lib/navigation';
import { refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '@/lib/api';
import { authApi } from '@/services';
import type { Role, User } from '@/types';

type Status = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : role === 'OPERATOR' ? '/operator' : '/account');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const queryClient = useQueryClient();
  const booted = useRef(false);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus('guest');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session on load: the httpOnly refresh cookie yields a new access token.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const token = await refreshAccessToken();
      if (!token) return setStatus('guest');
      try {
        setUserState(await authApi.me());
        setStatus('authenticated');
      } catch {
        clear();
      }
    })();
  }, [clear]);

  useEffect(() => {
    setSessionExpiredHandler(clear);
    return () => setSessionExpiredHandler(null);
  }, [clear]);

  const adopt = useCallback((session: { user: User; accessToken: string }) => {
    setAccessToken(session.accessToken);
    setUserState(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email, password) => adopt(await authApi.login({ email, password })),
      register: async (input) => adopt(await authApi.register(input)),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          clear();
        }
      },
      setUser: setUserState,
    }),
    [user, status, adopt, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Route guard. This is a convenience for navigation only — every protected
 * API call is authorised again on the server.
 */
export function ProtectedRoute({ roles }: { roles: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

/** Sends signed-in users away from the login / register pages. */
export function GuestOnly() {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (user) {
    const home = homeFor(user.role);
    return <Navigate to={user.role === 'PASSENGER' ? redirectFromState(location.state, home) : home} replace />;
  }
  return <Outlet />;
}
