# Backend CRUD Audit

**Status:** all four batches implemented. Two migrations to apply:
`20260912090000_add_alert_dismissed_at` and `20260912093000_add_soft_delete` (both additive
and nullable, safe on a live database). Verified by `npm run verify:crud` — 76 checks
against a real MySQL/MariaDB, repeatable.
**Method:** enumerated every route in `backend-v2/src/routes/*.ts` and compared against the
models in `prisma/schema.prisma`, then grepped the service layer to confirm each gap is
genuinely absent rather than reachable by another name.

## The headline numbers

The whole backend has **one** `DELETE` route (firmware) and **six** `PUT` routes. Nothing
can be removed except a firmware binary, and most resources can only be created and read.

## Matrix

| Resource | Create | Read | Update | Delete |
|---|---|---|---|---|
| Tenant | ✅ `POST /admin/tenants` | ⚠️ list only | ✅ name only | ❌ |
| User | ✅ `POST /admin/users`, `POST /user/register` | ✅ list + `/user/me` | ⚠️ role + tenant only | ❌ |
| Device | ✅ `POST /admin/devices`, device self-claim | ✅ list + detail | ❌ **no rename** | ❌ |
| DeviceConfig | — | ✅ | ⚠️ thresholds + sync-mode only | — |
| TankProfile | ✅ upsert | ✅ | ✅ upsert | ❌ |
| Alert | (server-raised) | ⚠️ per-device only | ✅ acknowledge | ❌ |
| DeviceClaimCode | ✅ | ✅ status | — | ❌ no revoke |
| UserDeviceMapping | ❌ **nothing writes it** | ❌ | ❌ | ❌ |
| FirmwareBinary | ✅ | ✅ | ✅ rollout / unroll | ✅ |
| DailySummary | (nightly job) | ❌ never read | — | — |

## Ranked findings

### 1. A self-claimed device can never be named — user-facing dead end

`claimDevice` (`services/device.service.ts:279`) creates the row as
`{ deviceId: hardwareId, tenantId, status: 'offline' }` — **no name**. There is no
`PUT /user/devices/:id` or `PUT /admin/devices/:id` to set one later. `name` is only ever
populated by `POST /admin/devices`, the ops-driven path.

Every UI falls back to `device.name || device.device_id`, so a user who pairs their own
sensor sees a raw hardware ID as the tank's name, permanently. This is the single most
visible gap and the cheapest to close.

### 2. `user_device_mappings` is a dead table — the sharing feature cannot work

`lib/access.ts:25` reads it as a legitimate third access path ("admin bypass, tenant match,
or an explicit user_device_mappings grant"), and the model has a `@@unique([userId, deviceId])`.
But `grep -rn userDeviceMapping src/` returns exactly one hit — that read. **Nothing in the
codebase ever inserts a row**, so the grant path can only ever be empty.

Either it needs the endpoints (share a device with a household member, list who has access,
revoke), or the read should be removed as dead code. Right now it is a half-built feature
that reads as if it works.

### 3. No delete anywhere except firmware

No `DELETE` for tenants, users, devices, alerts or claim codes. Practical consequences: a
mis-provisioned device is permanent; a departed user keeps tenant access forever; a test
tenant cannot be cleaned up.

**Delete needs care, not just a route.** `onDelete: Cascade` is set on Tenant→User,
Tenant→Device, Tenant→Alert and Device→(measurements, alerts, config, profile, tokens,
assignments, mappings). So a naive `DELETE /admin/tenants/:id` would silently destroy every
user, device and reading belonging to it. These should be:
- a soft delete / archive flag, or
- a hard delete guarded by an explicit count check ("this tenant owns 4 devices and 12,480
  readings — pass `?confirm=true`"), or
- a device *decommission* that detaches and keeps history.

That is a design decision, not a mechanical addition.

### 4. Alerts can only be read one device at a time

`GET /user/devices/:deviceId/alerts` is the only alert read. There is no
`GET /user/alerts` across a tenant's devices and no `GET /admin/alerts` across the fleet —
so the admin dashboard's "recent alerts (24h)" is a count with nothing to drill into, and a
combined alert inbox (which the Expo app's `AlertsScreen` implies) has no endpoint behind it.
Alerts also cannot be dismissed, only acknowledged.

### 5. Users cannot edit their own profile

`GET /user/me` exists; there is no `PUT /user/me`. A user cannot change their display name.
`name` is only set once, at `POST /user/register`. Admins can change someone's role and
tenant but not their name or email.

### 6. `daily_summaries` is written nightly and never read

`aggregation.service.ts` computes total usage, min/max/avg volume, refill counts and a leak
flag every night. No route exposes any of it. (The new `/history/series` endpoint
deliberately does not read it either — its volumes are frozen at aggregation time, so they
would disagree with read-time derivation after a tank profile edit. But the usage totals,
refill counts and leak flags have no such problem and are simply unused.)

### 7. Smaller gaps

- No single-tenant read (`GET /admin/tenants/:id`) — the UI recomputes from the list.
- Claim codes cannot be revoked before they expire.
- `POST /user/fcm-token` sets a token; nothing clears it, so a signed-out device keeps
  receiving pushes until the token is overwritten.
- A tank profile cannot be deleted, only overwritten.
- Users cannot set their own measurement/report interval; only an admin can, via
  `POST /admin/devices/:deviceId/config`.

## What was built

| Endpoint | Closes |
|---|---|
| `PUT /user/devices/:deviceId` | finding 1 — rename; blank/null clears to the hardware ID |
| `PUT /admin/devices/:deviceId` | rename + move between tenants |
| `PUT /user/me` | finding 5 |
| `DELETE /user/fcm-token` | finding 7 — stop pushes on sign-out |
| `DELETE /user/devices/claim-code/:code` | finding 7 — revoke a live code |
| `GET /user/alerts` | finding 4 — one inbox across accessible devices, with an unread count |
| `GET /admin/alerts` | finding 4 — fleet feed, filterable by tenant/device/severity/ack/window |
| `DELETE /user/devices/:id/alerts/:alertId` + `.../restore` | finding 4 — dismiss and undo |
| `GET/POST/DELETE /user/devices/:id/shares` | finding 2 — the writers the table never had |
| `DELETE /admin/tenants/:id` (+ `archive-preview`, `restore`) | finding 3 |
| `DELETE /admin/devices/:id` (+ `restore`) | finding 3 — decommission |
| `DELETE /admin/users/:id` (+ `restore`) | finding 3 — deactivate |

### Decisions taken

**Deletion is soft, everywhere.** Given the cascade rules, `archived_at` columns on
`tenants`, `devices` and `users` beat a real `DELETE`. Archiving is enforced where it
matters rather than only hiding rows from lists:
- `firebaseAuth` rejects an archived user with 403 — their Firebase credentials still
  exist, so without that check a "deleted" user would keep authenticating.
- `getAccessibleDeviceOrThrow` rejects an archived device with **410 Gone**, so a caller
  can tell "decommissioned" from "never existed".
- Archiving a tenant archives its devices and users in one transaction, so no orphan keeps
  access; a device in an archived tenant cannot be restored on its own.
- Deactivating a user clears their push token and drops their explicit device grants.
- Guards: you cannot deactivate yourself, and you cannot deactivate the last super admin.
- `DELETE /admin/tenants/:id` requires `?confirm=true`, with `archive-preview` returning
  the real device/user/reading counts so the UI can confirm with numbers.
- Archived rows are filtered out of every list (`include_archived=true` to see them) and
  out of the analytics counts, so a decommissioned device no longer inflates fleet health.

**Dismiss is a column, not a delete** (`alerts.dismissed_at`). A leak alert is an
operational event worth keeping after the user clears it off screen.

**Sharing does not create accounts.** `POST .../shares` resolves an existing user by email
and 404s otherwise. An invite flow with email delivery, tokens and expiry is a much larger
feature than closing this gap.

### Still open

- **`daily_summaries` remains unread** (finding 6). Usage totals, refill counts and leak
  flags are computed nightly and still have no endpoint.
- No single-tenant read (`GET /admin/tenants/:id`).
- Tank profiles still cannot be deleted, only overwritten.
- Users still cannot set their own measurement/report interval.
- The frontend uses rename and alert-dismiss; the sharing and archive endpoints have no UI
  yet.
