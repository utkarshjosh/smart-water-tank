# Frontend Redesign — Modern, Mobile-First AquaMind

**Status:** proposed, not started
**Scope:** `frontend/` only (Vite + React 18 + React Router app served from `/var/www/aquamind`).
The Expo app in `mobile-app/` is explicitly **out of scope** — it has one commit ever and
adding it would mean maintaining a second, parallel design system.

Surfaces covered: tenant app (`/app/*`), public + auth + onboarding (`/`, `/welcome`,
`/login`, `/signup`, `/reset-password`, `/app/onboarding/*`), and the admin console (`/admin/*`).

---

## 1. What is actually wrong today

Not opinion — these are the specific things producing the "10-year-old website" read.

**Two competing app shells.** `src/components/Layout.tsx` (admin) uses a `bg-gray-900`
sidebar at `md:w-72` with `p-8` content padding. `src/components/TenantLayout.tsx` uses a
`bg-slate-950` sidebar at `md:w-60` with `px-4 py-5` content padding. Same job, different
widths, different colors, different rhythm. Navigating admin → tenant feels like two apps.

**Design tokens defined three times and drifting.** `theme.json`, the `:root` block in
`src/app/globals.css`, and then 674 hardcoded `slate-*` / `sky-*` / `cyan-*` / `gray-*`
utility classes across the pages. The token layer exists but the pages route around it:
`DeviceDetailClient` uses `<Card>` and `bg-card`, while `app/devices/page.tsx` hand-rolls
`<article className="rounded-lg border border-slate-200 bg-white shadow-sm ...">` for the
same visual object. Two visual languages on screens one click apart.

**The dated-aesthetic checklist, all present.**
- Primary is `199 89% 48%` — a saturated cyan, the 2016 "tech-y water" default.
- Pulsing blurred gradient orbs: `blur-[120px] animate-pulse` blobs appear in
  `welcome/page.tsx`, `Layout.tsx`, and `TenantLayout.tsx`.
- `/noise.svg` at `opacity-[0.03] mix-blend-overlay` — glassmorphism grain.
- `GlassTank.tsx` renders a `perspective-[1000px]`, `backdrop-blur`, `rounded-[2rem]`
  skeuomorphic cylinder — and in `DeviceDetailClient` it is mounted on a hardcoded
  `bg-[#0f172a]` panel *inside an otherwise light page*, then `scale-[0.68]`-ed down.
- Radius is `0.5rem` globally, with stray `rounded-3xl` / `rounded-[2rem]` / `rounded-[1.8rem]`.

**No typographic scale.** Effectively two sizes: `text-sm` for everything and `text-2xl`
for page titles, plus one-off `text-[11px]`. No measure control, no weight hierarchy.

**Half-built dark mode, paid for everywhere.** 336 `dark:` variants across 19 files,
roughly doubling every class string — for a mode that is visually broken anyway (see the
`#0f172a` tank panel above). This is pure drag on every future edit.

**Mobile is an afterthought.** `/app/devices/:id` is a single column of six stacked cards
(readings → live tank → history → device/firmware → alerts → thresholds) ≈ three full
phone screens of scrolling, with the chart buried in the middle. Mobile nav is a hamburger
drawer containing two links.

**Charts are the weakest part of a data product.** `MeasurementHistoryChart.tsx` is 46
lines: `<XAxis tick={false}>` — there is literally no time axis; height is hardcoded 300px;
no zoom, no pan, no brush, no range selection; the category key is a full
`toLocaleString()` string per point; and the page fetches `days=7&limit=200`, hardcoded,
with no way for the user to ask for anything else.

**Feedback is text.** The only states are a border-spinner and the word `Saving...`.
No skeletons, no toasts, no optimistic writes, no page transitions, no pull-to-refresh.

---

## 2. Decisions (locked)

| Area | Decision | Why |
|---|---|---|
| Components | **Keep Radix, rewrite every `ui/*` primitive** against a new token layer; add Vaul, Sonner, Tooltip, ScrollArea, Skeleton | Radix is the accessible, modern standard and is already installed. The ugliness is tokens + layout, not the primitives. Page logic survives untouched. |
| Charts | **Apache ECharts**, tree-shaken custom build, lazy-loaded | `dataZoom` gives real pan + pinch-zoom + brush with touch inertia for free, plus crosshair axis-pointer, threshold marklines, and LTTB downsampling. |
| Icons | **Phosphor** (`@phosphor-icons/react`) | As requested. Replaces ~44 distinct Lucide icons across 27 files. |
| Motion | **`motion`** (Framer Motion successor) | Shared-element device-card → detail transitions, list stagger, layout animation. |
| Theme | **Light only.** Delete dark mode entirely | Requested. Also removes 336 `dark:` variants and the broken mixed-mode panels. |
| Data | **TanStack Query** | Caching, background refetch, optimistic mutations, and `isFetching` — the substrate all the "swiftness" work sits on. `src/lib/api.ts` axios client stays as the fetcher. |
| Nav | **Route-per-section on mobile**, bottom tab bar | Kills the long vertical card stack. |

Not changing: auth (`src/lib/auth-context.tsx`), the axios client, Firebase, routing library,
or any backend contract except the one new history endpoint in §5.

---

## 3. Design system

One source of truth: `src/styles/tokens.css`, consumed by `tailwind.config.js`.
`theme.json` is deleted. The `:root`/`.dark` blocks in `globals.css` are replaced.

### Color

Light only. Warm-neutral ground, one considered brand blue, no cyan, no neon, no gradients
on surfaces.

```
Canvas        #F7F7F6   app background
Surface       #FFFFFF   cards, sheets, popovers
Surface-sunk  #F1F1EF   inset wells, table headers, empty states
Hairline      #E5E5E1   default border
Line-strong   #D3D3CE   dividers that must read

Ink-1         #16161A   primary text
Ink-2         #55554F   secondary text, labels
Ink-3         #86867E   tertiary, timestamps, axis ticks

Brand         #2A78D6   primary actions, active nav, focus ring
Brand-press   #1C5CAB   active/pressed
Brand-wash    #E8F1FD   selected rows, subtle badges
```

Radius: `4 / 8 / 12 / 16 / 999`. Elevation: exactly two — `hairline` (border only, the
default) and `raised` (`0 1px 2px rgb(22 22 26 / .06), 0 4px 12px rgb(22 22 26 / .05)`) for
overlays only. No shadow on resting cards; cards are defined by their hairline.

### Type

Inter (variable, self-hosted — no external font request).

| Token | Size / line | Use |
|---|---|---|
| `display` | 32 / 1.15, 600 | page title |
| `title` | 20 / 1.3, 600 | card + section heads |
| `body` | 15 / 1.5, 400 | default |
| `label` | 13 / 1.4, 500 | form labels, table heads |
| `caption` | 12 / 1.35, 400 | timestamps, axis, help |
| `metric` | 28 / 1, 600, `tabular-nums` | KPI values |
| `metric-sm` | 20 / 1, 600, `tabular-nums` | inline readings |

`tabular-nums` on every number that updates live — otherwise the readings jitter on each
poll, which is a large part of why the current app feels cheap.

### Spacing & motion

4px base; layout on the 8px multiples. Content max-width 1200px.

Motion is the "swift" requirement, so it is specified, not improvised:

```
instant   90ms   cubic-bezier(.2,0,.38,.9)   hover, focus, checkbox, toggle
quick    140ms   cubic-bezier(.2,0,.38,.9)   press, tooltip, dropdown
smooth   220ms   cubic-bezier(.2,0,0,1)      sheet, drawer, tab underline, route change
spring   spring(stiffness 380, damping 32)   shared-element card→detail, tank fill
```

Nothing animates longer than 260ms except the tank fill (spring). All of it wrapped in
`prefers-reduced-motion: reduce` → duration 0.

The existing `animate-water-surface` 3s infinite keyframe is deleted; ambient looping
animation on a data screen is noise.

---

## 4. Navigation — killing the long scroll

### Mobile (< 768px)

App shell = fixed header (56px, title + contextual action) and a **bottom tab bar**
(56px + `env(safe-area-inset-bottom)`), content scrolls between them. Four tabs:
**Tanks · History · Alerts · Settings**.

Device detail stops being one page and becomes real routes, so each is one screenful:

| Route | Content |
|---|---|
| `/app/devices/:id` | Hero: tank visual + level, the 4 readings as a compact strip, a 24h sparkline, active-alert banner |
| `/app/devices/:id/history` | Full-bleed browsable chart, nothing else competing for height |
| `/app/devices/:id/alerts` | Alert list + acknowledge |
| `/app/devices/:id/settings` | Thresholds, tank setup entry, device & firmware info |

Segmented control at the top of the detail screen switches these; each is a route, so back
works and the browser restores position. On desktop the same four render as a two-column
grid on one page — the routes still exist and stay deep-linkable.

Also: `Add device` and tank setup become a full-screen step flow on mobile
(one question per screen) rather than a wizard in a side sheet.

### Desktop (≥ 768px)

Sidebar 240px, collapsible to 64px icon rail. **One** shell component, `AppShell`, with a
`variant="tenant" | "admin"` prop — replaces `Layout.tsx` + `TenantLayout.tsx` and their
four sidebar/header/drawer files.

---

## 5. Charts — "extremely flexible and browsable"

### Backend prerequisite (blocking)

Today: `GET /api/v1/user/devices/:id/history?days&limit` returns raw rows, newest-first,
capped at 10 000. Browsing a year of 30-second readings over that is not viable.

Add bucketing — `backend-v2/src/routes/user.routes.ts` + `user.service.ts`:

```
GET /api/v1/user/devices/:id/history
  ?from=<iso>&to=<iso>
  &bucket=raw|5m|1h|1d
  &metrics=level_percent,volume_l,temperature_c,battery_v

-> { bucket, from, to, series: { <metric>: [[ts, min, avg, max]] } }
```

- `bucket=auto` (default) picks from the requested span: ≤ 24h → raw, ≤ 7d → 5m,
  ≤ 90d → 1h, beyond → 1d.
- Bucketed rows aggregate `MIN/AVG/MAX` in SQL, so a month of data is ~720 points
  regardless of the sampling rate.
- `min`/`max` render as a soft band behind the average line — on a water tank this is what
  actually shows you overnight draw and refill spikes, which the current mean-only line hides.
- The `daily_summary` table that `aggregation.service.ts` already computes nightly is
  currently written and never read by anything. `bucket=1d` reads it instead of scanning
  raw measurements.

Keep `days`/`limit` accepted as aliases so nothing breaks mid-deploy.

### The chart component

`src/components/charts/TimeSeriesChart.tsx`, ECharts custom build
(`echarts/core` + `LineChart` + `GridComponent` + `TooltipComponent` + `DataZoomComponent`
+ `MarkLineComponent` + `CanvasRenderer`) ≈ 65KB gzip, lazy-loaded on the history route only.

Interactions:
- **Pan** — drag inside the plot. **Zoom** — pinch on touch, wheel on desktop, both via
  `dataZoom` `inside`.
- **Brush** — a slider `dataZoom` below the plot showing the full range with a preview
  sparkline; drag the handles to scope.
- **Range chips** above the chart: `24h · 7d · 30d · 90d · Custom`. Changing a chip changes
  the query window, which changes the bucket, which refetches. Zooming past the loaded
  window triggers a fetch of the wider window at the coarser bucket — so the user can zoom
  out to a year without ever hitting a wall.
- **Crosshair** `axisPointer` with a snapping tooltip showing timestamp + value + the
  min/max of that bucket. Tooltip is `confine: true` so it never escapes the viewport on a phone.
- **Threshold marklines** for `tank_low_threshold_pct` / `tank_full_threshold_pct` from
  `/config`, drawn on the level chart — the alert bounds become visible on the data.
- **Refill/leak event markers** as `markPoint`s once the alerts feed is joined in.
- Double-tap / double-click resets zoom. The current range is written to the URL
  (`?from=&to=&metric=`) so a view is shareable and survives refresh.

Metric switching stays a segmented control, but renders as **small multiples** on desktop
(all four stacked, shared x-axis, synced crosshair) and one-at-a-time on mobile.
Never a dual y-axis.

### Chart palette

Validated with the dataviz validator (all-pairs, light mode, `#FFFFFF` surface):
lightness band PASS, chroma PASS, CVD separation PASS (worst ΔE 9.2), normal-vision
PASS (worst ΔE 16.3).

| Metric | Hex |
|---|---|
| Level | `#2A78D6` |
| Volume | `#1BAF7A` |
| Temperature | `#EB6834` |
| Battery | `#4A3AA7` |

Volume's green measures 2.82:1 on white — under 3:1, so the relief rule applies: it always
ships with a direct value label and the crosshair tooltip, never color alone. Min/max band
is the series color at 12% alpha. Line width 2px; markers ≥ 8px and hover-only; grid
hairline `#E5E5E1`; axis ticks in `Ink-3`.

Status colors are reserved and never used as a series, always with icon + label:
good `#0CA30C` · warning `#FAB219` · serious `#EC835A` · critical `#D03B3B`.

---

## 6. Feedback & perceived speed

- **TanStack Query** everywhere. `staleTime` 30s, background refetch on focus and on
  reconnect, `keepPreviousData` on range changes so the chart never blanks while
  refetching — it dims and shows a 2px top progress bar instead.
- **Skeletons, not spinners.** Every list, card and chart gets a shaped skeleton matching
  its final layout. The four `animate-spin` border rings go away.
- **Optimistic mutations** on alert acknowledge and threshold save — the UI commits
  instantly and rolls back on failure with a toast. Right now `acknowledgeAlert` already
  updates local state optimistically but silently swallows the error into `console.error`;
  that becomes a real rollback + toast.
- **Sonner toasts** replace the inline `Saved` text and the `console.error` swallowing.
- **Live data.** Poll `/current` on a 15s interval while the tab is visible (via Query's
  `refetchInterval` + `document.visibilityState`), with a "Live · updated 4s ago" indicator.
  Numbers cross-fade on change rather than snapping; `tabular-nums` keeps them from jittering.
- **Pull-to-refresh** on mobile list and detail screens.
- **Route transitions** — 220ms fade+8px rise; the device card morphs into the detail hero
  via a shared `layoutId`.
- **Offline / stale states.** The `level_percent_stale` flag already returned by `/current`
  gets a proper treatment (dimmed value + "last known 14:32" chip) instead of today's
  absolutely-positioned floating pill.
- Touch targets ≥ 44px; `:focus-visible` ring on brand, 2px offset, on every interactive element.
- All interactive surfaces get a 90ms press state — the single cheapest thing that makes a
  UI feel responsive rather than dead.

---

## 7. Phases

Each phase ends compiling, deployable, and visually coherent — no phase leaves the app
half-restyled.

**Phase 0 — Foundation** *(no visible change)*
Add deps (`@phosphor-icons/react`, `echarts`, `motion`, `@tanstack/react-query`, `vaul`,
`sonner`, `@radix-ui/react-tooltip`, `@radix-ui/react-scroll-area`). Drop `lucide-react`
and `recharts` at the end of Phase 3. Create `src/styles/tokens.css`, rewire
`tailwind.config.js`, self-host Inter, delete `theme.json`. Add PWA manifest +
`apple-mobile-web-app-*` meta and `viewport-fit=cover` to `index.html` (`frontend/index.html`
currently has no manifest at all). Install the Query provider in `main.tsx`.

**Phase 1 — Kill dark mode & unify the shell**
Delete `theme-provider.tsx`, `mode-toggle.tsx`, and the theme bootstrap script in
`index.html`. Strip all 336 `dark:` variants. Build `AppShell` + `BottomTabBar` +
`SideNav`; delete `Layout.tsx`, `TenantLayout.tsx`, `sidebar.tsx`, `tenant-sidebar.tsx`,
`header.tsx`, `tenant-header.tsx`, `mobile-sidebar.tsx`, `tenant-mobile-sidebar.tsx`,
`sidebar-drawer.tsx` (nine files → three).

**Phase 2 — Primitives**
Rewrite all 17 `src/components/ui/*` against the new tokens. Add `Skeleton`, `Toast`
(Sonner), `Tooltip`, `BottomSheet` (Vaul), `SegmentedControl`, `StatTile`, `EmptyState`,
`Sparkline`, `StatusDot`. Swap Lucide → Phosphor across all 27 files. Delete `.backup/`.

**Phase 3 — Charts** *(the headline)*
Backend bucketed history endpoint + tests. `TimeSeriesChart` with the full interaction set.
`/app/devices/:id/history` route. Small multiples on desktop. Delete
`MeasurementHistoryChart.tsx` and `DeviceHistoryChart.tsx`.

**Phase 4 — Tenant app**
Device list rebuilt on the new primitives with a real card component + sparkline.
Device detail split into the four routes. `GlassTank` redrawn as a flat SVG tank on a light
surface — same fill semantics, no `backdrop-blur`, no `perspective`, no `#0f172a` panel,
spring-animated level. Onboarding + tank setup as a full-screen step flow.

**Phase 5 — Public & auth**
Landing page rebuilt light: drop the `#0f172a` ground, the three pulsing orbs, and the
noise overlay. Login / signup / reset unified on one auth layout.

**Phase 6 — Admin**
Same shell, same primitives. The four list pages get a shared `DataTable`
(sticky header, sortable, responsive → cards on mobile). `admin/firmware/page.tsx` is 856
lines and `admin/tenants/page.tsx` is 652 — both get split into components while restyling.

**Phase 7 — Polish & verify**
Motion pass, focus-visible audit, Lighthouse mobile (target ≥ 95 a11y, ≥ 90 perf),
real-device check at 360px / 390px / 768px / 1280px, bundle-size check on the ECharts
chunk, `prefers-reduced-motion` verification.

---

## 8. Risks

- **ECharts bundle.** Mitigated by the custom build + lazy-loading it only on the history
  route. Gate: if the chunk exceeds 90KB gzip, drop `MarkLine` and draw thresholds as a
  custom overlay.
- **The bucketed endpoint is on the critical path for Phase 3.** Build it first; the
  frontend can develop against `bucket=raw` in the meantime.
- **Stripping 336 `dark:` variants touches 19 files at once.** Do it mechanically in its own
  commit, separate from any restyling, so the diff stays reviewable.
- **Phase 4 changes URLs.** `/app/devices/:id` keeps working (it becomes the overview tab);
  the three new child routes are additive. No redirects needed.
- **`admin/firmware` is the riskiest restyle** — it drives real OTA rollouts. Restyle it
  last, and do not touch its logic in the same commit as its markup.

## 9. Explicitly not in scope

`mobile-app/` (Expo), the firmware, any backend change beyond the history endpoint,
i18n, and the `sync_mode` toggle noted as an open follow-up in
`plans/unified-tank-config-and-mqtt.md`.
