# Plan: AquaMind Android v2 — a glanceable, data-first tank app

> **The call:** delete `mobile-app/`, build `mobile/` fresh as an Expo SDK 54 /
> React Native app with a native Android layer (prebuild, not Expo Go). Keep
> TypeScript + Firebase + the EAS project; throw away every line of UI.
> The differentiator is **home-screen widgets + instant cached render**, not
> another tab bar.

Companion to the frontend revamp happening in parallel. Both consume the same
backend (`backend-v2`) and should share one colour/motion vocabulary
(`frontend/theme.json`).

---

## 1. Why a rewrite, not a refactor

`mobile-app/` is 1,215 lines of scaffolding, last touched 2025-12-07, and it is
**not shippable today** — not "dated", actually broken:

| # | Problem | Evidence |
|---|---|---|
| 1 | **Every cold start logs the user out.** Firebase JS SDK `getAuth()` on RN defaults to *memory* persistence. `@react-native-async-storage/async-storage` isn't even a dependency. This is the "really difficult login system". | `mobile-app/src/config/firebase.ts:47` |
| 2 | **A release APK cannot reach the backend.** `baseURL` falls back to `http://localhost:3000`, and Android 9+ blocks cleartext HTTP anyway. | `mobile-app/src/config/api.ts:5` |
| 3 | **Config is split across two mechanisms that disagree.** `firebase.ts` reads `Constants.expoConfig.extra`, `api.ts` reads `process.env`. `app.json`'s `extra.apiUrl` is dead config nothing reads. | `app.json:26` vs `api.ts:5` |
| 4 | **Push notifications do not exist in the app.** No `expo-notifications`, no `@react-native-firebase/messaging`, no call to `POST /api/v1/user/fcm-token`. The backend's whole alert fan-out (`alert.service.ts` → `sendEachForMulticast`) delivers to nobody. | `package.json`, `backend-v2/src/services/alert.service.ts:163` |
| 5 | **Guaranteed null-crash on real data.** The backend deliberately returns `volume_l: null` / `level_cm: null` when the sensor can't be read or no tank profile exists; the app calls `.toString()` on them unguarded. | `DeviceDetailScreen.tsx:87,128,134` |
| 6 | **Ignores the canonical metric.** Backend computes `level_percent` (+ `level_percent_stale`, `level_percent_as_of`) from the tank profile. The app shows only litres and never mentions staleness. | `backend-v2/src/services/user.service.ts:38-63` |
| 7 | **Alerts screen is an N+1 fan-out on launch.** 1 + N requests, sequentially, no pagination, no acknowledge action — and `POST .../acknowledge` exists. | `AlertsScreen.tsx:30` |
| 8 | **"My Tank" is `devices[0]`** sorted by name. Rename a tank and your home screen silently changes which tank it shows. | `HomeScreen.tsx:49` |
| 9 | **No device pairing at all.** The claim-code flow exists in the backend and in the webapp (`AddDeviceWizard.tsx`); the app's empty state says "Contact your administrator". | `HomeScreen.tsx:90` |
| 10 | Redundant `POST /user/register` — `firebaseAuth` middleware already auto-provisions tenant + user on first authenticated request. | `LoginScreen.tsx:41` vs `firebaseAuth.middleware.ts:28` |
| 11 | Logout calls `navigation.navigate('Login')` on a navigator that has no `Login` route while signed in → throws. | `SettingsScreen.tsx:12` |
| 12 | `return null` auth gate → white flash on every launch. `userInterfaceStyle: "light"`, white splash, no dark mode. | `AppNavigator.tsx:32`, `app.json:8` |

Nothing here is worth keeping. The *backend* is in good shape and is the real
asset — that's what the app should be built to exploit.

### ⚠ Unrelated but urgent
`secrets-prod` is **committed to git** and contains a production `device id` +
`token`. A device token is a bearer credential for telemetry ingest. Rotate it
and `git rm --cached secrets-prod`, add it to `.gitignore`. Not part of this
plan's work, but don't let it sit.

---

## 2. What this app is

A **glanceable instrument**, not a dashboard. Ranked by how often it's used:

1. **"Am I about to run out of water?"** — answered from the home-screen
   widget, without opening the app. This is 90% of real usage.
2. **"Something just happened"** — a push notification that is readable on the
   lock screen and actionable from it (Acknowledge / Open).
3. **"Show me the trend"** — one screen, one chart, sub-second, works offline.
4. **Setup** — pair a device, enter tank geometry, set thresholds. Done once,
   must not be painful.

Three design laws that follow:

- **Never show a spinner for data we've seen before.** Render last-known value
  instantly with an explicit "as of 4 min ago", then revalidate underneath.
  The backend already hands us `level_percent_stale` / `level_percent_as_of` —
  honour them literally.
- **Percent is the hero, litres is the subtitle.** `level_percent` is
  profile-derived and self-consistent with litres by construction
  (`tank-profile.service.ts`). Lead with it.
- **`null` means unknown, never zero.** The backend is rigorous about this and
  the UI must be too: a dash and a "sensor unreadable" chip, never `0.0L`.

---

## 3. Stack decisions

| Area | Choice | Why / rejected |
|---|---|---|
| Framework | **Expo SDK 54, RN 0.81, New Architecture, Hermes, prebuild (`android/` committed or CI-generated)** | Keeps TS + the existing Firebase/EAS project, shares mental model with the webapp. **Rejected:** native Kotlin/Compose — best animation + Glance widget story, but a full rewrite in a second language for a solo-maintained repo. **Rejected:** staying in Expo Go — widgets and native Firebase are impossible there. |
| Routing | **expo-router** (file-based, typed routes) | Free deep links, which widgets and notification taps both need (`aquamind://device/<id>`). |
| Auth | **`@react-native-firebase/auth`** + **`@react-native-google-signin/google-signin`** | Native SDK persists sessions automatically — fixes problem #1 outright. Google one-tap needs native. Drop the `firebase` JS SDK entirely. |
| Push | **`@react-native-firebase/messaging`** + **`@notifee/react-native`** | RNFB gives background/quit-state data-message handling (required to refresh widgets from a push). Notifee gives per-severity channels with custom sounds and notification actions. *Alt:* `expo-notifications` alone — simpler, but weaker background data handling. |
| Server state | **TanStack Query** + persisted cache in **MMKV** | Stale-while-revalidate is exactly law #1. Persisted cache = instant cold-start paint. |
| Time series cache | **expo-sqlite** | Bucketed series per device/range, so a chart scroll never hits the network. |
| Animation | **Reanimated 4** (UI-thread worklets) + **react-native-gesture-handler** | Reanimated 4 requires New Arch, which SDK 54 gives us. |
| Drawing | **@shopify/react-native-skia** | The glass tank + charts are custom paths with animated gradients. Skia renders them at 120fps off the JS thread. **Rejected:** `react-native-chart-kit` (current) — SVG-based, unmaintained, can't animate properly. **Rejected:** Victory Native XL — fine, but our single-series chart is ~150 lines of Skia and we want total motion control. |
| Widgets | **`react-native-android-widget`** (Expo config plugin) | Widget UI declared in TSX, compiled to Android `RemoteViews`. **Rejected:** hand-written Kotlin + Jetpack Glance — more capable and more idiomatic, but a second codebase for the same pixels. Revisit if the TSX widget hits a wall. |
| Storage (KV) | **react-native-mmkv** | Sync reads at startup; the widget bridge needs a synchronous store. |
| Haptics / Audio | **expo-haptics**, **expo-audio** | `expo-audio` supersedes `expo-av`. |
| Background refresh | **expo-background-task** (WorkManager) | Supersedes `expo-background-fetch`. 15-min floor — a backstop, not the primary path (see §5). |
| Validation | **zod** at the API boundary | Same library as the backend. Parsing responses is what would have caught bug #5 at the edge instead of in a render. |
| Package name | **keep `com.watertank.mobile`** | Tied to `google-services.json` + the existing EAS project `8fdff070-…`. Changing it means a new Firebase app and a non-upgradable install. |

Pin exact versions at integration time — check each library's New-Architecture
support against the SDK 54 matrix before adding it.

---

## 4. Screens

```
mobile/
  app/
    _layout.tsx              root: providers, theme, splash hold, auth gate
    (auth)/sign-in.tsx
    (app)/_layout.tsx        tab bar (3 tabs, not 4)
    (app)/index.tsx          Tanks
    (app)/alerts.tsx         Activity
    (app)/settings.tsx
    device/[id]/index.tsx    Detail
    device/[id]/tank-setup.tsx
    device/[id]/thresholds.tsx
    pair/index.tsx           Add-device wizard (modal)
  src/
    api/         typed client + zod schemas + query keys
    ui/          tokens, primitives (Text, Card, Pill, Sheet, Button)
    viz/         GlassTank.tsx, Sparkline.tsx, SeriesChart.tsx  (Skia)
    feedback/    haptics.ts, sound.ts  (single chokepoints, both user-togglable)
    widget/      widget TSX + state bridge (MMKV)
    push/        token registration, background handler, channels
  widgets/       widget previews + appwidget-provider XML overrides
```

**Tanks** (home) — one card per device. Card = `GlassTank` at 96px, big
percent, litres + capacity subtitle, online dot, "as of" line. Single device →
card expands to fill, skipping a pointless list. `active_alert` from
`/user/devices` tints the card (amber = low, red = leak) with no extra request.
Pull to refresh. FAB → Pair.

**Detail** — shared-element transition from the card: the same tank grows into
the hero. Range segmented control (24h / 7d / 30d), Skia area chart with a
drag-scrub readout, refill markers, and a stats row (today's usage, refills,
min/max) from `daily_summaries` — data the backend computes today and *nobody
has ever seen*. Secondary: temperature, battery, RSSI, firmware, sync mode.
Overflow → rename, tank setup, thresholds, CSV export.

**Activity** — one flat tenant-wide alert feed (new endpoint, §6.3), grouped by
day, severity-coloured, swipe-right to acknowledge with a haptic tick. Filter
chips by type.

**Pair** — mirrors `AddDeviceWizard.tsx` but native: mint claim code → show it
big with a countdown ring → step-by-step "join the `AquaMind-Setup` WiFi,
pick your network, type this code" → poll
`/devices/claim-code/:code/status` every 3s → success → straight into tank
setup. *Stretch (phase 6+):* Android `WifiNetworkSpecifier` can join the
device's AP from inside the app and POST the form to `192.168.4.1` directly,
skipping the OS WiFi-settings detour entirely. Evaluate against the
WiFiManager portal's actual form fields before promising it.

**Tank setup** — port `TankSetupWizard` + `TankDiagram`: shape, dimensions,
parallel unit count, sensor offset, dead zone, with a live-updating diagram and
the computed capacity echoed back. Geometry is the single input that makes every
downstream number correct, so it gets the most care of any form in the app.

**Settings** — account, notification toggles per alert type, sound on/off,
haptics on/off, units, theme (system/dark/light), app version + OTA update
channel, sign out (which must revoke the push token — see §6.7).

---

## 5. Home-screen widgets — the headline feature

Widgets appear in the launcher's widget picker as soon as the APK is installed.
No Play Store needed. That fits the offline-install plan exactly.

**Three sizes**, one `GlassTank` visual language, all rendered from cache:

| Size | Content |
|---|---|
| 2×1 | Percent, status dot, tank name. The lock-glance widget. |
| 2×2 | Glass tank + percent + litres + "as of". The default. |
| 4×2 | Tank + 24h sparkline + today's usage + alert chip. |

**Rules**
- **Never render a spinner or an empty state in a widget.** Last-known value +
  relative timestamp, always. A stale widget is useful; a blank one is a bug
  report.
- Tap anywhere → deep link to that device's detail screen.
- Small refresh affordance on 2×2 / 4×2 → enqueue an immediate WorkManager job.
- Multi-tank: each widget instance is **bound to one device** at placement time
  via a configuration activity. Don't make a widget that guesses.

**Freshness — three tiers, because Android's widget refresh floor is 30 min:**
1. **Push-driven (primary).** Every alert FCM already fires; add
   `level_percent`, `device_name`, `as_of` to its `data` payload so the
   background handler updates the widget for free. Plus a debounced
   *telemetry digest* data-only message — at most 1 per device per 10 min, and
   only when percent moved ≥3%. Cheap, battery-sane, and makes the widget feel
   live.
2. **WorkManager backstop.** `expo-background-task`, 15-min minimum, fetches
   `/user/overview` and rewrites widget state.
3. **`updatePeriodMillis` = 30 min** as the floor the OS guarantees.

**Bridge:** one `widget_state` JSON blob in MMKV (shared with native), written
by the foreground app, the FCM background handler, and the background task
alike. The widget renderer only ever reads that blob — it never fetches. One
writer shape, three writers, zero network in the render path.

**Don't forget the picker polish:** `previewImage`/`previewLayout`,
`description`, and `targetCellWidth/Height` in the appwidget-provider XML.
Browsing the widget menu is the first impression, and a default grey preview
undoes a lot of work.

---

## 6. Backend work this depends on

Small, mostly additive, all in `backend-v2`. **The app's speed is mostly
decided here** — §6.1 and §6.2 are what turn a 3-second launch into a
200ms one.

### 6.1 `GET /api/v1/user/overview` — one call, whole app
Returns every device with latest reading, `level_percent` (+ stale flags),
today's `daily_summaries` row, and an unacknowledged alert count. Launch goes
from `1 + 2N` requests to **1**. Also fix the N+1 *inside*
`listDevicesForTenant` (`user.service.ts:126` does 4 queries per device in a
`Promise.all` loop) with grouped queries. Serve an `ETag`.

### 6.2 Bucketed series — **done**, on the web-UI branch
Landed as `GET /api/v1/user/devices/:id/history/series` (MIN/AVG/MAX per bucket
in SQL, with explicit gap markers). The app reads it; its client-side
downsampling is gone.

<details><summary>Original spec</summary>

`GET /api/v1/user/devices/:id/series?range=24h|7d|30d&buckets=120`
Server-side downsampling: `GROUP BY` time bucket returning
`{t, min, max, avg, n}`. Today the app pulls up to 1,000 raw rows and plots 10
of them. A phone should download ~120 points for any range, ever. Let the
bucket carry min/max so the chart can draw a range band — it tells the refill
story better than a mean line.

</details>

### 6.3 Alert feed — **done**
`GET /api/v1/user/alerts`, from the web-UI branch, extended here with optional
cursor pagination. Covers explicitly shared devices, not just the tenant's.

### 6.4 Acknowledge by id — **done**
`POST /api/v1/user/alerts/:alertId/acknowledge`, so a notification action can
acknowledge with only the `alert_id` the FCM payload carries.

### 6.5 Daily usage — **done**
Landed on `main` as `GET /api/v1/user/devices/:id/usage`, finally surfacing what
`aggregation.service.ts` has been computing nightly. The app does not read it
yet — that is a detail-screen addition.

### 6.6 `GET /api/v1/user/stream` (SSE)
Live telemetry to a foregrounded app: hook `GatewayCore.handleTelemetry` and
emit per-tenant events. SSE over the existing HTTPS/nginx path, Firebase bearer
auth, native browser-grade reconnect semantics.
nginx needs `proxy_buffering off` on that location (the OTA-download block at
`aquamind.nginx.conf:51` is the pattern to copy). **Rejected:** MQTT-over-WSS
to phones — mosquitto has no WS listener and `mqtt-auth.routes.ts` ACLs are
device-scoped (`devices/<id>/…` only); adding user auth + a WS listener there
is a much bigger surface than one SSE route.

### 6.7 Multi-device push tokens — **done**
`User.fcmToken` is a single column. Sign in on a tablet and the phone silently
stops receiving alerts; sign out and the backend keeps pushing to a signed-out
device forever. Add:

```
model PushToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  platform  String   // android | ios | web
  lastSeenAt DateTime @updatedAt
  createdAt DateTime @default(now())
  @@index([userId])
}
```
`POST /user/push-tokens` (upsert), `DELETE /user/push-tokens/:token` (sign-out),
and fan out over all of a tenant's tokens in `sendFCMNotifications`, pruning on
`messaging/registration-token-not-registered`. Keep `fcmToken` written in
parallel for one release, then drop it.

### 6.8 Richer FCM data payload
Add `device_name`, `level_percent`, `as_of` to the alert `data` map so both the
notification text and the widget can render without a follow-up fetch.

### 6.9 Rename — **done**
Landed on the web-UI branch as `PUT /api/v1/user/devices/:id` (not PATCH). The
app does not call it yet; that is part of phase 4.

---

## 7. Motion, sound, haptics

### Motion
Derive from `frontend/theme.json` so the app and webapp feel like one product:
primary `hsl(199 89% 48%)`, accent `hsl(188 86% 53%)`, dark-first.

| Moment | Treatment | Budget |
|---|---|---|
| Level change | Spring on the water surface + odometer digit roll | 450ms, spring(0.8, 12) |
| Water surface idle | Skia sine wave, 2 offset waves, amplitude ∝ recent Δ | continuous, UI thread |
| Card → Detail | Shared-element: tank scales + translates, rest cross-fades | 280ms, ease-out-quint |
| List appear | Stagger 28ms/row, fade + 8px rise | ≤250ms total |
| Pull to refresh | Water ripple filling the pull distance, droplet release at threshold | follows gesture |
| Tab switch | 120ms cross-fade + icon micro-scale | 120ms |
| Alert arrival (in-app) | Toast slides down, severity-tinted, 1 pulse | 320ms |
| Pairing success | Tank fills 0→70% + checkmark draw-on | 900ms, once |

Non-negotiables: **every animation runs in a Reanimated worklet** (the JS
thread is for data); **`AccessibilityInfo.isReduceMotionEnabled` collapses all
of it to opacity-only**; nothing loops forever except the water surface, and
that pauses when the screen is unfocused or the battery saver is on.

### Haptics (`expo-haptics`, one `feedback/haptics.ts` chokepoint)
`selectionAsync()` on tab/segment change and swipe-to-ack commit ·
`impactAsync(Light)` at the pull-to-refresh threshold ·
`notificationAsync(Success)` on pairing complete and tank-setup save ·
`notificationAsync(Warning)` on a critical alert arriving in-app.
**That's the whole map.** Nothing on scroll, nothing on every tap, nothing on
navigation. User-togglable, default on. The rule: haptics confirm a *state
change*, never acknowledge a *touch*.

### Sound (`expo-audio`)
A 5-cue pack, water-derived, mastered to ≈−16 LUFS, `.ogg` or `.m4a`, **<30KB
each**:

| Cue | Character |
|---|---|
| `tick` | Tiny filtered droplet — segmented control, swipe commit. Very quiet. |
| `paired` | Two-note rising droplet with a short tail — device paired. |
| `refill` | Soft rising fill swell — tank crossed back above threshold. |
| `alert` | Low wooden knock + damped water ring — tank low / leak. |
| `ack` | Short muted thud — alert dismissed. |

UI sound **off by default**, alert sound on. Always respect silent mode and
duck under other audio. Never play sound while the app is backgrounded — that's
the notification channel's job.

**Notification channels (Android):** create per severity at first launch —
`critical` (custom `alert` sound, vibration pattern, bypass DND opt-in),
`high`, `info` (silent). Channel sound is **immutable after creation**: to
change it later you must create a new channel id. Get the ids and sounds right
the first time, and version the ids (`critical_v1`) so a future change is
possible.

`old_files/motorBand*.wav` in the repo are real pump recordings — good source
material for a "pump running" cue if pump control ever lands.

---

## 8. Performance budgets

Treat these as CI-checked, not aspirational. Target device: mid-range Android,
4GB RAM.

| Metric | Budget |
|---|---|
| Cold start → first meaningful paint (cached) | **< 1.2s** |
| Cold start → fresh data on screen | < 2.0s |
| Tanks screen: requests on launch | **1** (`/user/overview`) |
| Chart points over the wire, any range | **≤ 120** |
| Detail screen open → chart drawn (cached) | < 150ms |
| Scroll / animation | 60fps floor, 120fps where the panel allows; 0 JS-thread animation |
| APK size (arm64-v8a split) | **< 30MB** |
| Warm RAM | < 180MB |
| Full offline read | all screens render from cache with "as of" labels |

How: Hermes bytecode · R8 + resource shrinking · ABI splits · no moment/lodash
· MMKV not AsyncStorage · `expo-image` with memory-disk caching · lazy routes ·
`FlashList` if a tenant ever has many devices · render-from-persisted-cache
before the first network call resolves.

---

## 9. Distribution — offline install, no Play Store

- **EAS build profiles:** `preview` → APK, internal distribution;
  `production` → APK **and** AAB (AAB ready for the day Play happens). Set
  `"android": { "buildType": "apk" }` explicitly rather than relying on the
  internal-distribution default.
- **Stable keystore from day one.** Let EAS manage it, then download and back
  it up. A lost keystore means no upgrade path for anyone who sideloaded — they
  must uninstall (losing data) to install the next build.
- **Distribute** the APK as a GitHub release asset with a QR code. Document
  "Install unknown apps" for the browser/file-manager on first install.
- **`expo-updates` OTA channel.** This is the big one for a sideloaded app:
  JS/asset changes ship to installed APKs without anyone reinstalling.
  Reserve new APKs for native-dependency changes. The webapp already has an
  `appUpdateWatcher.ts` pattern to mirror for the "update ready, restart?"
  prompt.
- **Version:** keep `appVersionSource: "remote"` + `autoIncrement`. Surface
  version + update id in Settings so a bug report is diagnosable.

---

## 10. Phasing

Each phase ends with something installable on a phone. Backend tasks (§6) are
listed where the app first needs them and can run in parallel.

**Phase 0 — foundation (~1–2 days)**
Scaffold `mobile/` (SDK 54, expo-router, TS strict) · prebuild Android · RNFB
app + `google-services.json` · design tokens generated from
`frontend/theme.json` · UI primitives · typed API client with zod schemas ·
EAS profiles + first signed APK on a device, showing a placeholder.
*Exit: a signed APK installs and renders the shell.*

**Phase 1 — auth that never annoys (~2 days)**
Native Firebase auth with real persistence · Google one-tap primary, email
secondary · splash held until auth resolves (no white flash, no `return null`) ·
401 → force-refresh → retry-once interceptor · drop the redundant `/register`
call · sign-out that revokes the push token.
*Exit: sign in once, kill the app 20 times, still signed in.*
Backend: §6.7.

**Phase 2 — data core (~3–4 days)**
`/user/overview` wired · TanStack Query + MMKV persistence · Tanks screen with
the Skia `GlassTank` · Detail with the Skia series chart over `/series` ·
SQLite series cache · full offline render with "as of" labels.
*Exit: airplane mode still shows yesterday's tank and chart.*
Backend: §6.1, §6.2, §6.5, §6.9.

**Phase 3 — alerts & push (~2–3 days)**
Notification channels per severity · token registration + multi-device ·
background/quit data handler · notification actions (Acknowledge / Open) ·
deep links · Activity feed with swipe-to-ack.
*Exit: trigger a low-tank alert with `backend-v2/scripts/simulate-device.ts`,
get it on the lock screen, acknowledge without unlocking.*
Backend: §6.3, §6.4, §6.8.

**Phase 4 — onboarding (~3 days)**
Pair wizard (claim code + countdown + polling) · tank setup wizard with live
diagram · thresholds editor · rename.
*Exit: a stranger unboxes a node and has a correct percentage reading without
being told anything.*

**Phase 5 — widgets (~3–4 days)**
Three widget sizes · config activity for device binding · MMKV state bridge ·
push-driven + WorkManager + 30-min refresh tiers · picker previews · deep links.
*Exit: install the APK offline, long-press home, browse the widget menu, place
all three, watch them update from a push.*

**Phase 6 — the polish that's the actual point (~3–4 days)**
Shared-element transitions · water-surface motion · odometer numerals · ripple
refresh · the haptic map · the 5-cue sound pack + settings toggles ·
reduce-motion paths · accessibility pass (labels, contrast, font scaling to
200%) · performance budget enforcement · Maestro E2E flows (sign-in, pair,
ack-from-notification) · final APK + release notes + QR.

Roughly **3–4 focused weeks**, and phases 0–3 alone already beat what's in the
repo today by a wide margin.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| `react-native-android-widget` can't express the glass tank well in `RemoteViews` | Prototype the 2×2 widget in phase 0, not phase 5. Fall back to a Kotlin/Glance widget module — isolated, doesn't touch the rest of the app. |
| Widget freshness feels stale despite three tiers | The digest FCM is the real fix. Budget it carefully (≥3% change, ≤1/10min/device) and measure battery before widening. |
| SSE through nginx buffers and feels dead | `proxy_buffering off` + a 20s keep-alive comment frame. If it still misbehaves, fall back to 20s polling while foregrounded — the app is correct either way, just less live. |
| Prebuild/native upgrades bite on SDK bumps | Commit `android/` and treat upgrades as explicit PRs, or keep it CI-generated with pinned plugin versions. Either is fine; pick one and don't drift. |
| Sound/haptics tip into annoying | Both togglable, sound off by default, the haptic map in §7 is a ceiling not a menu. Ship to 2–3 real users before widening. |
| Losing the signing keystore | Back it up out-of-band the day it's created. |
| Two apps diverge visually from the webapp | One generated token file from `theme.json` is the single source of truth for colour + radius. |

---

## 12. Decisions and open questions

**Decided (2026-09-11):**

- **One tank per household is the norm.** Tanks is therefore single-tank-first:
  one tank gets the whole screen, with the percentage as the hero figure. A
  second tank adds a selector row above it rather than demoting everything into
  a list. The same assumption simplifies the widget: an unconfigured instance
  showing the only tank is right far more often than it is wrong, so the
  configuration activity is a phase-5 refinement rather than a blocker. It also
  argued the shell down from a tab bar to a stack — a three-tab bar would spend
  a third of the bottom edge on a list with one row.
- **Insights are later, and nothing is scaffolded for them now.** No empty
  "Insights" tab, no placeholder cards. The usage/refill/leak figures that
  `daily_summaries` already computes (§5.5) surface as plain rows on the detail
  screen; anything cleverer waits until there is a reason for it.

**Still open:**

1. **Is a motor/pump on the roadmap for this app?** If yes, the UI needs a
   control surface with confirmation + state feedback, which is a different
   screen shape — better to reserve the slot now than retrofit.
2. **iOS ever?** Everything above is Android-first but cross-platform except
   the widgets. If iOS matters within a year, that's an argument for RN (as
   planned) over Kotlin, and WidgetKit becomes a separate phase.
4. **Keep `mobile-app/` around during the build, or delete at phase 0?**
   Recommend: build in `mobile/`, delete `mobile-app/` when phase 3 lands, so
   there's never two half-apps in the repo for long.
5. **`secrets-prod`** — rotate that device token (see §1).
