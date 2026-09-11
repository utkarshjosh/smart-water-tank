import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from '@react-native-firebase/auth';

import { auth } from '@/auth/firebase';
import { signInWithGoogle, signOutGoogle } from '@/auth/google';

/**
 * Auth state for the whole app.
 *
 * `initialising` is true only until the native SDK reports its restored
 * session — a few ms, spent behind the splash screen. v1 returned null during
 * this window, which is why every launch flashed white.
 *
 * There is deliberately no call to POST /user/register here: the backend's
 * firebaseAuth middleware auto-provisions the user and a personal tenant on the
 * first authenticated request, so signing in is the whole of signing up.
 */

type AuthValue = {
  user: User | null;
  initialising: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth(), (next) => {
      setUser(next);
      setInitialising(false);
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      initialising,
      signInWithEmail: async (email, password) => {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
      },
      signUpWithEmail: async (name, email, password) => {
        const credential = await createUserWithEmailAndPassword(auth(), email.trim(), password);
        const displayName = name.trim();
        if (displayName) {
          await updateProfile(credential.user, { displayName });
        }
      },
      signInWithGoogle,
      sendPasswordReset: async (email) => {
        await sendPasswordResetEmail(auth(), email.trim());
      },
      signOut: async () => {
        // TODO(phase 3): revoke this device's push token before signing out,
        // or the backend keeps pushing alerts to a signed-out phone.
        await signOutGoogle();
        await signOut(auth());
      },
    }),
    [user, initialising]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Firebase error codes mapped to something a person can act on. */
export function describeAuthError(error: unknown): string {
  // A cancelled Google sheet is not an error worth a message.
  if ((error as Error)?.name === 'GoogleCancelled') return '';
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/weak-password':
      return 'Pick a password of at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    default:
      return (error as Error)?.message || 'Could not sign in. Try again.';
  }
}
