// @aquamind/contracts — the shape of every AquaMind API response, as zod
// schemas. The backend validates what it sends against these (in
// non-production) and types its handlers with them; the web console and the
// Android app parse what they receive. One definition, three consumers.
//
// Modules follow the API surface:
//   primitives   ISO dates, the enums mirrored from Prisma, ok/error envelopes
//   user         /api/v1/user/*      tenant-facing: devices, readings, alerts, sharing, usage
//   history      /history/series     server-bucketed time series
//   tank-profile /tank-profile       tank geometry
//   device       /api/v1/devices/*   what the firmware reads
//   admin        /api/v1/admin/*     fleet, tenants, users, firmware

export * from './primitives';
export * from './user';
export * from './history';
export * from './tank-profile';
export * from './device';
export * from './admin';
