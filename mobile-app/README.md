# Water Tank Mobile App

React Native mobile app built with Expo for end users to monitor their water tanks.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Firebase and API settings:
   - Option 1: Set in `app.json` under `expo.extra`
   - Option 2: Use environment variables (see `env.example`)
   - Option 3: Create `app.config.js` for dynamic configuration

3. Start Expo development server:
```bash
npm start
```

4. Run on device:
   - Press `a` for Android
   - Press `i` for iOS
   - Scan QR code with Expo Go app

## Environment Variables

See `env.example` for configuration options.

For Expo, you can:
1. Use `app.config.js` to read from environment variables
2. Set values directly in `app.json`
3. Use `expo-constants` to access configuration

## Scripts

- `npm start` - Start Expo dev server
- `npm run android` - Run on Android
- `npm run ios` - Run on iOS
- `npm run web` - Run in web browser

## Screens

- Login/Registration - Firebase authentication
- Home - Primary tank status display
- Devices - List of user's devices
- Device Detail - Historical charts and metrics
- Alerts - Alert history and notifications
- Settings - User preferences and logout

## Firebase Setup

1. Create Firebase project
2. Enable Authentication (Email/Password)
3. Enable Cloud Messaging (FCM)
4. Add iOS/Android apps in Firebase Console
5. Download configuration files and add to project

## Building for Production

### Method 1: EAS Build (Recommended - Cloud-based)

EAS Build is the recommended way to build production APKs/AABs. It handles all the complexity in the cloud.

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
```

2. **Login to Expo:**
```bash
eas login
```

3. **Configure EAS Build:**
```bash
eas build:configure
```
This creates an `eas.json` file with build profiles.

4. **Build APK for Android:**
```bash
# Build APK (for direct installation)
eas build --platform android --profile preview

# Build AAB (for Google Play Store)
eas build --platform android --profile production
```

5. **Download the build:**
   - The build will be uploaded to Expo's servers
   - You'll get a URL to download the APK/AAB when it's ready
   - Or use: `eas build:list` to see your builds

### Method 2: Local Build (Requires Android Studio)

Build the APK locally on your machine.

1. **Install Android Studio:**
   - Download from https://developer.android.com/studio
   - Install Android SDK, build tools, and platform tools
   - Set up Android environment variables:
     ```bash
     export ANDROID_HOME=$HOME/Android/Sdk
     export PATH=$PATH:$ANDROID_HOME/emulator
     export PATH=$PATH:$ANDROID_HOME/platform-tools
     export PATH=$PATH:$ANDROID_HOME/tools
     export PATH=$PATH:$ANDROID_HOME/tools/bin
     ```

2. **Generate native Android project:**
```bash
npx expo prebuild --platform android
```

3. **Build the APK:**
```bash
# Development build
npx expo run:android

# Or build directly with Gradle
cd android
./gradlew assembleRelease

# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

### Method 3: Development Build APK

For testing with custom native code (like Firebase):

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
```

2. **Build development client:**
```bash
eas build --platform android --profile development
```

3. **Install on device and run:**
```bash
npm start
# Then press 'a' to open on Android device
```

### Build Profiles (EAS Build)

Create `eas.json` for custom build configurations:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### Notes

- **APK vs AAB**: APK is for direct installation, AAB is required for Google Play Store
- **Signing**: EAS Build handles signing automatically, or configure in `eas.json`
- **Firebase**: Make sure `google-services.json` is in the project root
- **Environment Variables**: Use `app.config.js` to inject environment variables during build


