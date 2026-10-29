# Clear water insights UI

The web home and tank overview now lead with water available, water used today,
water added today, and a usual-day baseline. The baseline uses at least three
well-covered days from the preceding two weeks: at least 20 hours of the local day observed.
The rest of such a day (typically a power cut) is filled in with the usual use at those
clock hours, taken from hours in the range that were fully observed on at least three days.
Gaps with no usual figure may total at most 15 minutes, so a new tank still needs nearly
complete days. Per-day bars and totals stay as recorded; only averages, weekday patterns
and busiest/quietest day use the filled-in figures.
Day length follows the tank timezone, including daylight-saving transitions. Today is excluded, and hours without usable observation do not count toward
coverage. A tank that is just starting to report shows a learning state.

Hourly, daily and history charts on web and Android now share one display model.
Water used and refills have separate positive-bar views, visible litre axes,
sparse time labels, and a persistent selected-period readout. Missing readings
remain distinct from measured zero use. The activity list shows at most three recent changes, with volumes labelled
as estimates. Volume-based insight notifications retain that qualification even
when optionally reworded. The activity card no longer stretches to match the chart
height. Sensor graphs remain accessible under technical readings/history.
Zero-use windows have a plain recorded-zero state instead of an arbitrary 0–1 L axis.
The chart starts on refills when that is the only recorded movement. Recording
coverage appears next to the daily summary on both apps. Android no longer
repeats used/filled totals within its chart header.
Android home now exposes daily use directly, with sensor diagnostics collapsed
on the detail page. Light and dark themes use the existing app palette.

Daily insight settings now explain off, learning, ready and saved states. Android
has the same account opt-in as web. The Android notification parser now accepts
`daily_insight` pushes for foreground display and tap routing; informational
insights cannot modify the tank widget through the alert parser.

## Local review

Run `npm ci`, then `npm run build --workspace=packages/contracts`.
Start the frontend with its normal public Firebase configuration and open
`/water-preview.html`. This separate development entry uses an in-memory API
adapter with installation-day, usual-day, no-reading, offline and connection-error
scenarios. It does not contact production or modify devices. It is not an entry
in the production web build. A nonempty dummy Firebase API key is sufficient for
this preview, e.g. `NEXT_PUBLIC_FIREBASE_API_KEY=water-preview-only`.

## Validation and release

- Shared model tests cover outages versus zero use, large refills and invalid values.
- Android payload tests cover real insight payloads, existing alerts and malformed pushes.
- Web/Android type checks, frontend production build, test suites and lint were run.
- The Android bundle was exported locally for the existing 2.0.0 runtime.
- Visual review covers desktop, 320/390px web layouts and Android components in
  a React Native Web harness with native services mocked, including both themes.
  No Android phone or emulator was attached; this does not confirm native push delivery.

No native dependency, Android permission, API route or firmware changes are
part of this update. The backend now adds an observed_seconds column to
hourly_usage; apply its additive migration before running the updated backend,
then rebuild recent rollups from raw measurements. Unrebuilt legacy rows are
unverified and are hidden from usage estimates and comparisons. Publish to the EAS preview channel for an installed
APK on the matching 2.0.0 runtime before promoting the update to production.
The live web deployment and EAS channels have not been changed.

## Oracle check on 22 October 2026

The API was online and the repaired sensor was reporting. The database had one
registered phone, no opted-in daily-insight users and no saved daily insights.
The insight preview had no eligible candidate. After explicit approval, Firebase dry-run validation accepted the one registered
phone token and daily-insight payload (1 accepted, 0 rejected). No test notification
was delivered. This validates Firebase credentials, the token and the payload; it
does not confirm Android display, tap routing or on-device notification permissions.
A subsequent explicitly approved real test was also accepted by Firebase
(1 accepted, 0 rejected); the user confirmed it appeared on their phone.
This verifies delivery of that real test, separately from the UI/data review.

## Usage correctness audit

Production compared 1,030.6 L on 18 October with 752.5 L on 22 October and booked
278.1 L into the reconnect hour. That was not a measured draw during that hour.
A local replay of the audited raw readings now records zero measurable draw
within observed stretches, about 409 L added in one refill, and about 94 minutes
of usable observation. Water movement during the missing intervals is unknown.
Production caches have not been rewritten and the correction has not been deployed.

- Long gaps reset the reference; the limit follows report cadence, with bounds.
- Invalid/null sensor cycles preserve a discontinuity when numeric rows are filtered.
- Noise filtering cannot join readings across a gap.
- Coverage is accumulated only between consecutive usable readings, split at local hours.
- A single sample or an unverified old cache row cannot masquerade as zero use.
- Cached activity expires when the device is offline or the readings are stale.
  Older offline dates show when detailed events are unavailable. Partial recorded
  hours remain visible in a single-day chart but cannot establish usual patterns.
- Comparative pushes require all but 15 minutes of the local day's observed time,
  including 23/25-hour days. Quiet-night insights require coverage in each night hour
  and use fixed wording about recorded level behaviour without ruling out a leak.
- Weekly refill comparisons require all seven days in both weeks to be well covered.

These remain estimates from tank-level changes and the configured tank geometry,
not a flow meter. Simultaneous use and refilling can offset each other; sensor
relocation, persistent bias and incorrect tank dimensions cannot be reconstructed
from level readings alone. No claim of correctness for every physical fault is made.
