import { getApp } from '@react-native-firebase/app';
import { getAuth, type Auth, type User } from '@react-native-firebase/auth';

/**
 * React Native Firebase, not the `firebase` JS SDK.
 *
 * This is the fix for the defect that made v1 unusable: the JS SDK's
 * `getAuth()` on React Native defaults to in-MEMORY persistence, so every cold
 * start signed the user out. The native SDK persists the session itself — there
 * is no persistence option to forget to pass.
 */
export function auth(): Auth {
  return getAuth(getApp());
}

export function currentUser(): User | null {
  return auth().currentUser;
}

/**
 * Bearer token for the API, or null when signed out.
 *
 * The native SDK caches and refreshes the token, so the un-forced path is
 * local. `forceRefresh` is used by the one 401 retry in the API client.
 */
export async function getIdTokenOrNull(forceRefresh = false): Promise<string | null> {
  const user = currentUser();
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    // Revoked/disabled account, or offline with an expired cached token.
    // Returning null makes the request 401 and the auth gate handle it.
    return null;
  }
}
