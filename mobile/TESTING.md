# Getting AquaMind v2 onto a phone

A walkthrough for the first real build. Nothing here has run on a device yet —
typecheck, `expo config` and the backend test suite pass, and that is all.

Work through it in order; each part ends with something you can check. When
something does not match, send me the exact error text and which step it was.

---

## Part 1 — Firebase console (once)

Project `watertank-7c30e`.

1. **Project settings → Your apps.** Look for an Android app with package
   `com.watertank.mobile`. It should already exist — the old app used it, and
   keeping it is why the new app did not change its package. If it is missing,
   add it with exactly that package name.

2. **Add the signing SHA-1.** Google Sign-In will not work without it. Get it
   after your first build:
   ```bash
   cd mobile
   npx eas-cli@latest credentials      # Android → your profile → Keystore → SHA-1
   ```
   For a local Android Studio build it is the debug keystore instead:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
     -storepass android -keypass android | grep SHA1
   ```
   Paste it into the Firebase Android app under **SHA certificate fingerprints**.
   You need one per keystore, so a debug build and an EAS build both need theirs.

3. **Download `google-services.json`** (button on that same Android app) and put
   it at `mobile/google-services.json`. It is gitignored on purpose — Part 3
   covers getting it to a cloud build.

4. **Authentication → Sign-in method.** Enable **Email/Password**. Enable
   **Google** too if you want one-tap; it works without, the button just hides.

5. **Copy the Web client ID.** Authentication → Sign-in method → Google → Web SDK
   configuration. Or pull it straight out of the file you just downloaded:
   ```bash
   cd mobile
   node -e "console.log(require('./google-services.json').client[0].oauth_client.find(c=>c.client_type===3)?.client_id)"
   ```
   That value is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` below. It ends in
   `.apps.googleusercontent.com`. **It is the web client, not the Android one** —
   the Android client id looks identical and silently fails.

6. **Cloud Messaging.** Confirm the Firebase Cloud Messaging API (V1) is enabled
   for the project. The backend already uses it for the old app, so it should be.

✅ **Check:** `mobile/google-services.json` exists and you have the web client id.

---

## Part 2 — Backend (deploy the push_tokens migration)

The web-UI rework is already on `main` and deployed, so its two migrations are
applied. This branch adds exactly one:

| Migration | Adds |
|---|---|
| `20260912100000_add_push_tokens` | the `push_tokens` table |

It only creates a table, so the currently-running backend keeps working
unchanged while it applies. `deploy.sh` takes a database backup first and runs
migrations *before* restarting PM2, which is the correct order here — the new
code reads `push_tokens`, so a restart-first deploy would 500 until the
migration landed.

On the server:

```bash
cd /path/to/smart-water-tank
git fetch && git checkout main && git pull     # once this branch is merged
./deploy.sh backend
```

That backs up the database, installs, builds, applies migrations, then
restarts. To check what is pending before committing to it:

```bash
cd backend-v2 && npx prisma migrate status
```

`users.fcm_token` stays and is still written, so v1 builds keep receiving alerts
through the switchover.

✅ **Check:**
```bash
cd backend-v2 && npx prisma migrate status   # "Database schema is up to date!"
curl -s https://aquamind.utkarshjoshi.com/health
```

---

## Part 3 — Build the app

Two routes. **Take route A unless you already have Android Studio set up** — it
needs nothing installed locally.

### Route A — EAS (cloud build)

```bash
cd mobile
npm install
npx eas-cli@latest login

# google-services.json is gitignored, so hand it to EAS as a file secret.
npx eas-cli@latest secret:create --scope project \
  --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

Add your web client id to the `development` profile in `eas.json`:

```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://aquamind.utkarshjoshi.com",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "…apps.googleusercontent.com"
}
```

Then build and install:

```bash
npx eas-cli@latest build --profile development --platform android
# download the APK from the link it prints, install it on the phone
npx expo start --dev-client
```

The development profile builds a **dev client**: the native shell is fixed, and
JS reloads from your laptop, so only native dependency changes need a rebuild.
Phone and laptop must be on the same network.

### Route B — local (Android Studio installed)

```bash
cd mobile
npm install
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="…apps.googleusercontent.com"
npm run prebuild        # generates android/
npm run android         # builds and installs over USB
```

Needs JDK 17 and `adb devices` showing your phone with USB debugging on.

✅ **Check:** the app opens on a dark splash, then the sign-in screen with a
glass tank next to the AquaMind wordmark.

---

## Part 4 — Test script

Run these in order. Each says what should happen.

### 1. Sign-in persistence — the defect that made v1 unusable

1. Sign in (create an account if you need one; the backend provisions your
   tenant on the first authenticated request, no separate signup step).
2. Swipe the app away from recents. Reopen. **Five times.**

**Expect:** every launch goes straight to Tanks. No sign-in screen, no white
flash between splash and content.
**If it fails:** this is the exact v1 bug and I want to know immediately.

### 2. Tanks screen

**Expect:** one tank filling the screen — a glass tank with the water animating
to its level, the percentage as the big number, litres underneath, and a line
like "4 min ago".

- No tank paired yet? You get a "Pair a tank" card — that is Part 5.
- No tank dimensions set? An amber "Tank setup needed" card, and percentage
  shows `—`. That is correct: percent is derived from geometry. Set the tank up
  in the web app for now; the in-app wizard is the next phase.
- Sensor unreadable? `—` and a "Sensor unreadable" pill, never `0%`.

### 3. Offline render

1. Turn on airplane mode.
2. Swipe the app away and reopen it.

**Expect:** your tank still renders, from cache, with the same "as of" age. No
spinner, no blank screen, no error card. This is the whole point of the
persisted cache.

### 4. Push — the main event

Get a device token for a tank you own. If you do not have one, the easiest
source is the row in `device_tokens` for your device, or claim a device and keep
the token it returns.

On the server (or anywhere that can reach it):

```bash
cd backend-v2
export SIMULATOR_DEVICE_TOKEN="<device token>"
export SIMULATOR_BACKEND_URL="https://aquamind.utkarshjoshi.com"

# --level is the sensor-to-water DISTANCE in cm, not a percentage.
# Bigger = emptier. An empty tank reads (sensor_offset + height).
# With a 90 cm tank at offset 0: --level 80 is about 11% full.
npm run send-measurement -- --level 80
```

First set a low threshold so this trips: in the web app, that tank's alert
thresholds → **tank low** to something like 30%.

**Expect, with the app closed:**
- A notification: **"Tank low · <your tank>"** with the body naming a percentage.
- It has an **Acknowledge** action.
- Tapping the notification opens the app *on that tank's detail screen*.
- Tapping **Acknowledge** dismisses it without opening the app, and the alert
  shows as acknowledged in Activity afterwards.

**Then with the app open**, send another (change `--level` so it is a fresh
reading): the notification still appears, drawn by the app itself, with the same
Acknowledge action, and a single haptic buzz for a critical alert.

> Alerts de-duplicate: the backend suppresses a repeat of the same type on the
> same device within an hour. To retest sooner, acknowledge the alert first.

### 5. Widget — the reason for all of this

1. Long-press an empty area of the home screen → **Widgets**.
2. Find **AquaMind** in the list. Place **AquaMind tank**.

**Expect:** it paints immediately with your tank's level, litres and age — never
a spinner, never blank. Tapping it opens that tank in the app.

3. With the app fully closed, send another measurement that trips the alert
   (step 4). **The widget should update itself from the push**, within a few
   seconds of the notification arriving.

That last one is the bit I most want confirmed — it is the mechanism the whole
widget-freshness design rests on.

### 6. Activity

From Tanks, tap the **Activity** card.

**Expect:** every alert across every tank in one list, grouped by Today /
Yesterday / date. Tap **Acknowledge** — the row dims instantly, and stays
acknowledged after a pull-to-refresh.

### 7. Sign-out hygiene

1. Settings (gear, top right) → **Sign out**.
2. Trigger another alert from the server.

**Expect:** no notification on this phone. Signing out revokes this install's
token, so the backend stops pushing to it.

---

## What to send me

For anything that fails:

- **Which step**, and what you saw instead.
- **JS errors:** the red screen text, or the terminal running `npx expo start`.
- **Native crashes / push problems:**
  ```bash
  adb logcat -c && adb logcat | grep -iE "aquamind|notifee|firebase|ReactNative"
  ```
  Reproduce, then send the output.
- **Backend side:** `pm2 logs aquamind-backend --lines 100`. Alert sends log as
  `[alerts] tank_low for <name>: N notification(s) sent`. `N = 0` means no push
  token is registered — check the app got notification permission.

## Known-incomplete, do not report as bugs

- **No in-app tank-setup wizard** — use the web app (phase 4).
- **No custom alert sound** — channels use the default (phase 6).
- **Only the 2×2 widget** — 2×1 and 4×2, and picking which tank a widget shows,
  are phase 5. With one tank the widget shows it automatically.
- **Widget preview in the picker is generic** — no preview image yet (phase 5).
- **Launch still makes several requests** — `/user/overview` is not built yet.
