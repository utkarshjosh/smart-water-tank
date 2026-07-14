// ---------------------------------------------------------------------------
// Shared device wire protocol (Phase 2 — authoritative contract)
//
// One line-JSON protocol spoken over BOTH transports (HTTP body / MQTT topic
// payload). Every message is a single JSON object with a discriminating `type`
// field. These schemas are the single source of truth shared by the backend
// gateway and, later, the firmware (net_node.ino) + tools/debug-hub.
//
// Telemetry field names deliberately mirror the HTTP measurement body
// (`level_cm`, `temperature_c`, `battery_v`, `rssi`) so the SAME core
// `recordMeasurement` logic handles both transports, and telemetry carries the
// device's current `configVersion` for the piggyback stale-check.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// MQTT topic layout (all JSON payloads; {id} = hardware deviceId):
//   devices/{id}/announce   device->server  (not retained)
//   devices/{id}/telemetry  device->server  (not retained)
//   devices/{id}/ack        device->server  (not retained)
//   devices/{id}/config     server->device  (RETAINED, QoS 1)
//   devices/{id}/cmd        server->device  (not retained)
export const TOPIC_PREFIX = 'devices';
export const TOPIC = {
  announce: 'announce',
  telemetry: 'telemetry',
  ack: 'ack',
  config: 'config',
  cmd: 'cmd',
} as const;

// Commands the server can issue to a device. Kept as a plain string in the
// schema (not a strict enum) so an unknown/newer command never fails parsing;
// this list documents the known set for callers.
export const DEVICE_COMMANDS = ['getConfig', 'reboot', 'setMode', 'selftest'] as const;

// --- telemetry payload -------------------------------------------------------
// level_cm is the raw ultrasonic distance; null means "no reading this cycle"
// (never coerced to 0). Field names match the HTTP measurement body exactly.
export const telemetryDataSchema = z.object({
  level_cm: z.number().nullable(),
  temperature_c: z.number().nullable().optional(),
  battery_v: z.number().optional(),
  rssi: z.number().optional(),
});
export type TelemetryData = z.infer<typeof telemetryDataSchema>;

// --- message schemas ---------------------------------------------------------

export const announceMessageSchema = z.object({
  type: z.literal('announce'),
  id: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  fw: z.string().optional(),
  caps: z.array(z.string()).optional(),
  configVersion: z.number().int().nullable().optional(),
});

export const telemetryMessageSchema = z.object({
  type: z.literal('telemetry'),
  id: z.string().min(1),
  ts: z.number().optional(),
  configVersion: z.number().int().nullable().optional(),
  data: telemetryDataSchema,
});

// The server->device config payload. `config` is exactly the Phase 1
// buildDeviceConfig payload (operational + geometry + config_version), kept
// open (z.record) so the protocol module never has to duplicate that shape.
export const configMessageSchema = z.object({
  type: z.literal('config'),
  id: z.string().min(1),
  config: z.record(z.unknown()),
});

export const cmdMessageSchema = z.object({
  type: z.literal('cmd'),
  id: z.string().min(1).optional(),
  cmd: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

export const ackMessageSchema = z.object({
  type: z.literal('ack'),
  id: z.string().min(1),
  cmd: z.string(),
  ok: z.boolean(),
  msg: z.string().optional(),
});

// getConfig / setConfig / ping exist for parity with net_node.ino's line-JSON
// handler. `id` is optional because the sketch omits it on these requests.
export const getConfigMessageSchema = z.object({
  type: z.literal('getConfig'),
  id: z.string().min(1).optional(),
});

export const setConfigMessageSchema = z.object({
  type: z.literal('setConfig'),
  id: z.string().min(1).optional(),
  config: z.record(z.unknown()),
});

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  id: z.string().min(1).optional(),
});

export const deviceMessageSchema = z.discriminatedUnion('type', [
  announceMessageSchema,
  telemetryMessageSchema,
  configMessageSchema,
  cmdMessageSchema,
  ackMessageSchema,
  getConfigMessageSchema,
  setConfigMessageSchema,
  pingMessageSchema,
]);

export type AnnounceMessage = z.infer<typeof announceMessageSchema>;
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>;
export type ConfigMessage = z.infer<typeof configMessageSchema>;
export type CmdMessage = z.infer<typeof cmdMessageSchema>;
export type AckMessage = z.infer<typeof ackMessageSchema>;
export type GetConfigMessage = z.infer<typeof getConfigMessageSchema>;
export type SetConfigMessage = z.infer<typeof setConfigMessageSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type DeviceMessage = z.infer<typeof deviceMessageSchema>;

export type ParseResult =
  | { ok: true; message: DeviceMessage }
  | { ok: false; error: string };

// Validate inbound JSON (raw string or already-parsed object) and discriminate
// on `type`. Never throws — returns a tagged result so transport adapters can
// log and drop malformed frames without crashing.
export function parseDeviceMessage(input: unknown): ParseResult {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input);
    } catch {
      return { ok: false, error: 'invalid JSON' };
    }
  } else if (Buffer.isBuffer(input)) {
    try {
      candidate = JSON.parse(input.toString('utf8'));
    } catch {
      return { ok: false, error: 'invalid JSON' };
    }
  }

  const result = deviceMessageSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') };
  }
  return { ok: true, message: result.data };
}

// Build the server->device config message envelope around a merged payload.
export function buildConfigMessage(hardwareDeviceId: string, config: Record<string, unknown>): ConfigMessage {
  return { type: 'config', id: hardwareDeviceId, config };
}

// Build a server->device command message.
export function buildCmdMessage(hardwareDeviceId: string, cmd: string, args: Record<string, unknown> = {}): CmdMessage {
  return { type: 'cmd', id: hardwareDeviceId, cmd, args };
}
