# AquaMind mobile (Android)

A glanceable tank monitor: home-screen widgets, instant render from cache,
working auth and push. Rewrite of the abandoned `mobile-app/`.

Plan of record: [`plans/android-app-v2.md`](../plans/android-app-v2.md).

## Status

| Phase | | |
|---|---|---|
| 0 | Foundation — scaffold, tokens, primitives, typed API client, build profiles | done |
| 1 | Auth that never annoys — native Firebase persistence, Google one-tap | done |
| 2 | Data core — Tanks, detail, Skia charts, offline render | done against today's endpoints |
| 3 | Alerts & push — channels, tokens, background handler, Activity feed | done |
| 4 | Onboarding — pairing wizard done; tank-setup wizard outstanding | partial |
| 5 | Widgets — 2×2 prototype wired; 2×1 / 4×2, config activity, freshness tiers | partial |
| 6 | Polish — shared transitions, sound pack, full motion + a11y pass | not started |

Phase 3 shipped its backend half too: `/user/alerts` (tenant-wide feed),
`/user/alerts/:id/acknowledge`, and `POST`/`DELETE /user/push-tokens` backed by
a new `push_tokens` table. Still outstanding from plan §5 are `/user/overview`
and the bucketed `/series`, which are what take launch from `1 + 2N` requests to
one; when they land, `src/api/endpoints.ts` is the only file that changes.

### Push

Alerts arrive on three Android channels (`aquamind_critical_v1`,
`aquamind_high_v1`, `aquamind_info_v1`), chosen server-side by severity. A
channel's sound and importance are immutable once created, which is why the ids
carry a version: shipping the phase-6 sound pack means creating `_v2` channels
and migrating, not editing `src/push/channels.ts`.

Every alert push carries the tank's level, so the background handler repaints
the home-screen widget without making a request — the primary freshness tier in
plan §4. Acknowledge works straight from the notification, in every app state.

## Setup

```bash
npm install

# Firebase Android config for com.watertank.mobile, from the Firebase console.
# Gitignored on purpose; required for auth to work.
cp ~/Downloads/google-services.json ./google-services.json

npm run prebuild          # generates android/
npm run android           # builds + installs a dev client on a connected device
```

There is no Expo Go path: native Firebase and the home-screen widget both need
custom native code. Use a development build.

### Environment

Everything the app reads at runtime goes through `app.config.ts` into
`expo.extra`, and `src/env.ts` is the only module that reads it back. Nothing in
`src/` touches `process.env`, so there is no second mechanism to disagree with
the first — the defect that left v1's release build pointing at `localhost:3000`.

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | production builds | Build fails loudly if unset on a production build; defaults to the prod host otherwise. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | for Google sign-in | The OAuth **web** client id from the Firebase project, not the Android one. Omitted, the Google button hides itself. |

### Design tokens

`src/ui/tokens.ts` is generated from `frontend/theme.json` so the app and the
webapp cannot drift:

```bash
npm run tokens
```

Edit the webapp theme, regenerate, commit. Never hand-edit the generated file.
Status colours (ok / warn / crit / offline) live in `src/ui/theme.tsx` instead:
the webapp expresses those per-component with Tailwind utilities, so there is no
shared token to generate, and severity must never share a hue with the brand.

## Builds

```bash
eas build -p android --profile preview        # sideloadable APK
eas build -p android --profile production     # release APK
eas build -p android --profile production-aab # AAB, if Play ever happens
```

Back up the signing keystore the first time EAS creates it. Without it, anyone
who sideloaded has no upgrade path — they must uninstall, losing data.

`expo-updates` is configured, so JS and asset changes reach installed APKs
without a reinstall. Reserve new APKs for native dependency changes.

## Layout

```
app.config.ts          the one place build-time env becomes app config
index.js               entry: registers the widget task handler, then expo-router
src/
  api/                 fetch client, zod response schemas, query hooks
  auth/                native Firebase auth + Google one-tap
  app/                 expo-router routes
  ui/                  generated tokens, theme, primitives, page chrome
  viz/                 GlassTank and SeriesChart (Skia)
  feedback/            the complete haptic vocabulary
  widget/              widget state blob, renderer, headless task handler
  lib/                 formatting — where "null means unknown" is enforced
scripts/               token generator
```

## Conventions worth keeping

- **Every response is parsed by a zod schema.** Readings are nullable because
  the backend is rigorous that a null means *unknown*, never zero. v1 called
  `.toString()` on them and crashed on real data.
- **Never render a spinner for data already seen.** The persisted query cache
  paints last-known values on the first frame; "as of" labels carry the age.
- **Percent is the hero, litres the subtitle.** `level_percent` is derived from
  the tank profile server-side and is self-consistent with litres.
- **Haptics confirm a state change, never a touch.** The map in
  `src/feedback/haptics.ts` is a ceiling, not a menu.
- **The widget never fetches.** It reads one cached blob, so it always has
  something true to draw.
