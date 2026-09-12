import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dynamic config so there is exactly ONE place where build-time environment
 * becomes app configuration. v1 split this across `expo.extra` and
 * `process.env` read from two different modules, which disagreed and left a
 * release build pointing at http://localhost:3000. Everything the app needs at
 * runtime is resolved here and read back through src/env.ts only.
 */

const GOOGLE_SERVICES = './google-services.json';

// Production builds must not silently fall back to a dev host. Anything else
// (dev server, EAS preview without the var set) gets the documented default.
function resolveApiUrl(profile: string | undefined): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (profile === 'production') {
    throw new Error(
      'EXPO_PUBLIC_API_URL must be set for a production build. ' +
        'Set it in eas.json env or the build environment (e.g. https://aquamind.utkarshjoshi.com).'
    );
  }
  return 'https://aquamind.utkarshjoshi.com';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const apiUrl = resolveApiUrl(profile);
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  // react-native-firebase needs this file at PREBUILD time. It is gitignored,
  // so an EAS build machine gets it from a file secret instead (GOOGLE_SERVICES_JSON
  // holds a path there). Prebuild still works without either, so a fresh clone
  // can generate the project; auth then fails loudly at runtime rather than
  // cryptically at build time.
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync(resolve(__dirname, GOOGLE_SERVICES)) ? GOOGLE_SERVICES : undefined);
  if (!googleServicesFile) {
    console.warn(
      '[app.config] google-services.json not found — Firebase auth will not work in this build. ' +
        'Download it from the Firebase console (Android app com.watertank.mobile) into mobile/.'
    );
  }

  return {
    ...config,
    name: 'AquaMind',
    slug: 'aquamind',
    version: '2.0.0',
    scheme: 'aquamind',
    orientation: 'portrait',
    // Dark-first, but the OS (and the in-app override) still decide.
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',
    // Android-only for now; see plans/android-app-v2.md §12.
    platforms: ['android'],
    android: {
      package: 'com.watertank.mobile',
      adaptiveIcon: {
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
        backgroundColor: '#020817',
      },
      googleServicesFile,
      // POST_NOTIFICATIONS is requested at runtime on Android 13+.
      // RECEIVE_BOOT_COMPLETED lets placed widgets survive a reboot.
      permissions: ['android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED'],
      blockedPermissions: ['android.permission.RECORD_AUDIO'],
      predictiveBackGestureEnabled: true,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: false,
          data: [{ scheme: 'aquamind' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    updates: {
      // expo-updates is how JS reaches sideloaded APKs without a reinstall.
      url: 'https://u.expo.dev/8fdff070-5b63-4d4f-8a47-bb82b74745b9',
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },
    runtimeVersion: { policy: 'appVersion' },
    assetBundlePatterns: ['**/*'],
    plugins: [
      'expo-router',
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      '@react-native-google-signin/google-signin',
      [
        'expo-build-properties',
        {
          android: {
            // react-native-firebase requires static frameworks/the modular
            // headers path; on Android the relevant knob is minSdk for the
            // libraries we pull in. Keep R8 + resource shrinking on so the
            // sideloaded APK stays under the 30MB budget.
            minSdkVersion: 24,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#020817',
          image: './assets/images/splash-icon.png',
          imageWidth: 96,
        },
      ],
      [
        'react-native-android-widget',
        {
          widgets: [
            {
              name: 'Tank',
              label: 'AquaMind tank',
              description: 'Water level at a glance',
              minWidth: '140dp',
              minHeight: '140dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'horizontal|vertical',
              // 30 min is the floor Android guarantees. Fresher updates come
              // from push and WorkManager — see plans/android-app-v2.md §4.
              updatePeriodMillis: 1800000,
            },
          ],
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      ...config.extra,
      apiUrl,
      // Omitted rather than set to null when absent: Expo serialises a null
      // extra value as {}, which is truthy and would light up a Google
      // sign-in button that cannot work.
      ...(googleWebClientId ? { googleWebClientId } : {}),
      eas: { projectId: '8fdff070-5b63-4d4f-8a47-bb82b74745b9' },
    },
  };
};
