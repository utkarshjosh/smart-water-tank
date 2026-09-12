# Backend CRUD Audit

**Status:** audit only — nothing implemented yet
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

## Suggested order

1. **Device rename** (`PUT /user/devices/:deviceId` + admin equivalent) — small, unblocks
   the most visible problem.
2. **`PUT /user/me`** — small, obvious omission.
3. **Alert feeds** — `GET /user/alerts`, `GET /admin/alerts`, plus dismiss.
4. **Decide `user_device_mappings`**: build the sharing endpoints, or delete the dead read.
5. **Deletion strategy** — needs the soft-vs-hard decision above before any code.
6. **Expose `daily_summaries`** — usage/refill/leak history the UI could show today.
