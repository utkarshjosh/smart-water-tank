import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onIdTokenChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getEnv } from './env';

const firebaseConfig = {
  apiKey: getEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);

// Keep the Firebase session across full-page reloads. API calls also wait for
// this operation and Firebase's first auth-state event before reading
// auth.currentUser, otherwise a protected page can race session restoration
// and send an unauthenticated request during startup.
const persistenceReady = typeof window === 'undefined'
  ? Promise.resolve()
  : setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Error setting auth persistence:', error);
  });

let authStateReady: Promise<void> | null = null;

export function waitForAuthState(): Promise<void> {
  if (!authStateReady) {
    authStateReady = persistenceReady.then(
      () => new Promise<void>((resolve) => {
        const unsubscribe = onIdTokenChanged(
          auth,
          () => {
            resolve();
            unsubscribe();
          },
          (error) => {
            console.error('Error restoring Firebase auth state:', error);
            resolve();
            unsubscribe();
          }
        );
      })
    );
  }

  return authStateReady;
}

export default app;
