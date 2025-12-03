import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import Constants from 'expo-constants';

// Get Firebase config from app.json extra field or environment variables
const getFirebaseConfig = () => {
  // Try to get from expo-constants (app.json extra field)
  const extra = Constants.expoConfig?.extra;
  
  if (extra?.firebaseApiKey) {
    return {
      apiKey: extra.firebaseApiKey,
      authDomain: extra.firebaseAuthDomain,
      projectId: extra.firebaseProjectId,
      storageBucket: extra.firebaseStorageBucket,
      messagingSenderId: extra.firebaseMessagingSenderId,
      appId: extra.firebaseAppId,
    };
  }
  
  // Fallback to environment variables
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
};

const firebaseConfig = getFirebaseConfig();

// Validate that API key is set
if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your-firebase-api-key') {
  console.error('Firebase API key is not set or invalid. Please check your app.json or .env file.');
  throw new Error('Firebase API key is not configured. Please set firebaseApiKey in app.json extra field or EXPO_PUBLIC_FIREBASE_API_KEY in .env file.');
}

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);
export default app;


