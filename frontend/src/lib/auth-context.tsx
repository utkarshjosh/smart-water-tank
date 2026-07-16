import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import api from '@/lib/api';
import { auth } from '@/lib/firebase';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'super_admin' | string;
  tenant_id: string | null;
  tenant_name: string | null;
}

export type AuthStatus =
  /** Firebase is still restoring the persisted session, or the profile of a
   *  just-signed-in user is still loading. Render a loader, not a login form. */
  | 'initializing'
  | 'unauthenticated'
  | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Server-side identity (role, tenant). Null until loaded; null on fetch failure. */
  profile: UserProfile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const homeRouteForRole = (role: string | undefined) =>
  role === 'admin' || role === 'super_admin' ? '/admin/dashboard' : '/app/devices';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // The uid whose profile we are showing / fetching. Any /user/me response
    // that arrives after the signed-in uid has changed is discarded, so a
    // previous user's role can never win a race against the current one.
    let activeUid: string | null = null;

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      if (!nextUser) {
        activeUid = null;
        setUser(null);
        setProfile(null);
        setStatus('unauthenticated');
        return;
      }

      setUser(nextUser);

      // Token refreshes fire this listener too; the profile is still valid.
      if (nextUser.uid === activeUid) return;

      activeUid = nextUser.uid;
      setProfile(null);
      setStatus('initializing');

      try {
        const { data } = await api.get<UserProfile>('/api/v1/user/me');
        if (activeUid !== nextUser.uid) return;
        setProfile(data);
      } catch (error) {
        if (activeUid !== nextUser.uid) return;
        console.error('Failed to load user profile:', error);
        setProfile(null);
      }
      setStatus('authenticated');
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
      signOut: () => firebaseSignOut(auth),
    }),
    [status, user, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
