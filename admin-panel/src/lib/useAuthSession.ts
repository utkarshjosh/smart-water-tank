import { useEffect, useState } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { removeAuthToken, setAuthToken } from '@/lib/cookies';

export function useAuthSession() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (!nextUser) {
        removeAuthToken();
        return;
      }

      try {
        const token = await nextUser.getIdToken();
        setAuthToken(token);
      } catch (error) {
        console.error('Error syncing auth token:', error);
      }
    });

    return unsubscribe;
  }, []);

  return { user, loading };
}
