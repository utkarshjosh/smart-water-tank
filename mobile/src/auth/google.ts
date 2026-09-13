import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from '@react-native-firebase/auth';

import { auth } from '@/auth/firebase';
import { env } from '@/env';

/**
 * Google one-tap, the primary sign-in path.
 *
 * `googleWebClientId` is the OAuth *web* client from the Firebase project (not
 * the Android client) — Google's native SDK exchanges it for an ID token that
 * Firebase accepts. Until it is configured the UI hides this button rather than
 * showing one that always fails.
 */

export function googleSignInAvailable(): boolean {
  return !!env.googleWebClientId;
}

let configured = false;

function configure(): void {
  if (configured || !env.googleWebClientId) return;
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  configured = true;
}

export class GoogleCancelled extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'GoogleCancelled';
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!env.googleWebClientId) {
    throw new Error('Google sign-in is not configured in this build.');
  }
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  if (result.type === 'cancelled') throw new GoogleCancelled();

  const idToken = result.data.idToken;
  if (!idToken) throw new Error('Google returned no ID token.');

  await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
}

/** Clears the cached Google account so the next sign-in shows the picker. */
export async function signOutGoogle(): Promise<void> {
  if (!configured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Already signed out of Google, or Play Services unavailable — the
    // Firebase sign-out below is what actually matters.
  }
}
