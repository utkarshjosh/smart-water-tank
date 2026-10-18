import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { GatewayCore, shouldPushConfig } from './core';
import { DeviceGateway } from './types';
import { parseDeviceMessage, buildConfigMessage, TOPIC_PREFIX, TOPIC } from '../protocol';

// How long a session takeover may take (TCP + TLS + CONNACK) before it is
// abandoned. Short: it runs after an admin action and the broker is local.
const TAKEOVER_TIMEOUT_MS = 10_000;

export interface MqttAdapterOptions {
  url: string;
  // The BACKEND's own broker credentials (a privileged/static account),
  // distinct from per-device credentials which the broker validates against
  // DeviceToken via the auth hook (see src/routes/mqtt-auth.routes.ts).
  username?: string;
  password?: string;
  // TLS: CA bundle (for a private CA) and whether to verify the broker cert.
  ca?: string | Buffer;
  rejectUnauthorized?: boolean;
}

// MQTT transport adapter. Subscribes to the device->server topics, dispatches
// each frame through the shared GatewayCore, and implements server-initiated
// config delivery as a RETAINED publish so a reconnecting device always gets
// the latest config without a live round-trip.
//
// AUTH: this backend connects as its OWN client (username/password above). It
// does NOT see per-device credentials — the broker (Mosquitto) authenticates
// each device connection (username = deviceId, password = device token) via an
// HTTP auth hook that calls verifyDeviceCredentials (same hash + DeviceToken
// lookup as HTTP deviceAuth). As defense in depth the adapter still (a) drops
// frames whose payload id disagrees with the topic's deviceId, and (b) drops
// telemetry/announce from a deviceId that does not resolve to a known Device
// or whose Device is archived (the core logs that once per device).
export class MqttAdapter implements DeviceGateway {
  private client: MqttClient | null = null;

  constructor(private readonly core: GatewayCore, private readonly opts: MqttAdapterOptions) {}

  // Credentials and TLS, shared by the long-lived client and the short-lived
  // takeover connections of disconnectDevice.
  private connectionOptions(): IClientOptions {
    return {
      username: this.opts.username,
      password: this.opts.password,
      ...(this.opts.ca ? { ca: this.opts.ca } : {}),
      ...(this.opts.rejectUnauthorized !== undefined ? { rejectUnauthorized: this.opts.rejectUnauthorized } : {}),
    };
  }

  async start(): Promise<void> {
    const options: IClientOptions = {
      ...this.connectionOptions(),
      // Reconnect forever; a down broker must never take the process down.
      reconnectPeriod: 5000,
      connectTimeout: 30_000,
    };

    const client = mqtt.connect(this.opts.url, options);
    this.client = client;

    client.on('connect', () => {
      console.log('[mqtt] connected to broker', this.opts.url);
      const subs = [
        `${TOPIC_PREFIX}/+/${TOPIC.telemetry}`,
        `${TOPIC_PREFIX}/+/${TOPIC.announce}`,
        `${TOPIC_PREFIX}/+/${TOPIC.ack}`,
      ];
      client.subscribe(subs, { qos: 1 }, (err) => {
        if (err) console.error('[mqtt] subscribe failed', err);
        else console.log('[mqtt] subscribed:', subs.join(', '));
      });
    });

    client.on('error', (err) => console.error('[mqtt] client error', err));
    client.on('reconnect', () => console.log('[mqtt] reconnecting to broker...'));
    client.on('offline', () => console.warn('[mqtt] client offline'));
    client.on('close', () => console.log('[mqtt] connection closed'));
    client.on('message', (topic, payload) => {
      this.onMessage(topic, payload).catch((err) => console.error('[mqtt] message handler error', err));
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
  }

  // topic = devices/{deviceId}/{kind}
  private parseTopic(topic: string): { deviceId: string; kind: string } | null {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX) return null;
    return { deviceId: parts[1], kind: parts[2] };
  }

  private async onMessage(topic: string, payload: Buffer): Promise<void> {
    const parsedTopic = this.parseTopic(topic);
    if (!parsedTopic) {
      console.warn('[mqtt] ignoring message on unrecognized topic', topic);
      return;
    }

    const parsed = parseDeviceMessage(payload);
    if (!parsed.ok) {
      console.warn(`[mqtt] dropping malformed message on ${topic}: ${parsed.error}`);
      return;
    }
    const msg = parsed.message;

    // Payload id (when present) must match the topic's deviceId.
    if ('id' in msg && msg.id && msg.id !== parsedTopic.deviceId) {
      console.warn(`[mqtt] dropping message: payload id ${msg.id} != topic id ${parsedTopic.deviceId}`);
      return;
    }

    switch (msg.type) {
      case 'telemetry': {
        const outcome = await this.core.handleTelemetry(parsedTopic.deviceId, msg);
        if (outcome.archived) return;
        if (!outcome.recognized) {
          console.warn('[mqtt] dropping telemetry from unknown device', parsedTopic.deviceId);
          return;
        }
        // Push fresh config when the device is stale (piggyback) OR whenever it
        // is in live mode. Both modes use a retained config topic.
        if (shouldPushConfig(outcome)) {
          const config = outcome.config ?? (await this.core.resolveConfig(outcome.device!));
          this.publishConfig(parsedTopic.deviceId, config as unknown as Record<string, unknown>);
        }
        return;
      }
      case 'announce': {
        const outcome = await this.core.handleAnnounce(parsedTopic.deviceId, msg);
        if (outcome.archived) return;
        if (!outcome.recognized) {
          console.warn('[mqtt] dropping announce from unknown device', parsedTopic.deviceId);
          return;
        }
        if (outcome.config) {
          this.publishConfig(parsedTopic.deviceId, outcome.config as unknown as Record<string, unknown>);
        }
        return;
      }
      case 'ack': {
        console.log(`[mqtt] ack from ${parsedTopic.deviceId}: cmd=${msg.cmd} ok=${msg.ok}${msg.msg ? ' ' + msg.msg : ''}`);
        return;
      }
      default:
        // config/cmd/getConfig/setConfig/ping are not expected on the inbound
        // device->server subscriptions; ignore defensively.
        console.warn(`[mqtt] unexpected message type '${msg.type}' on ${topic}`);
    }
  }

  private publishConfig(hardwareDeviceId: string, config: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.client.connected) {
      console.warn('[mqtt] publish config skipped: broker is not connected');
      return Promise.resolve();
    }

    const message = buildConfigMessage(hardwareDeviceId, config);
    return new Promise((resolve) => {
      this.client!.publish(
        `${TOPIC_PREFIX}/${hardwareDeviceId}/${TOPIC.config}`,
        JSON.stringify(message),
        { retain: true, qos: 1 },
        (err) => {
          if (err) console.error('[mqtt] publish config failed for', hardwareDeviceId, err);
          resolve();
        }
      );
    });
  }

  // Server-initiated push (config-change hook). Resolves the device by internal
  // id and publishes its current merged config, retained.
  async pushConfig(internalDeviceId: string): Promise<void> {
    const message = await this.core.buildConfigMessageForDevice(internalDeviceId);
    if (!message) {
      console.warn('[mqtt] pushConfig: device not found for internal id', internalDeviceId);
      return;
    }
    await this.publishConfig(message.id, message.config);
  }

  // Ends a device's live session by taking over its client id: when a second
  // connection arrives with the same client id, the broker must drop the first
  // (MQTT 3.1.1 section 3.1.4). Firmware uses its hardware deviceId as client
  // id. The device reconnects within seconds, and that CONNECT goes through the
  // auth hook, which refuses an archived device or a revoked token. A separate
  // connection is needed because this adapter's own client must keep its id.
  //
  // Best effort, never rejects: if the broker can't be reached the session
  // stays up until the device reconnects on its own, and GatewayCore still
  // drops an archived device's frames in the meantime.
  disconnectDevice(hardwareDeviceId: string): Promise<void> {
    return new Promise((resolve) => {
      const takeover = mqtt.connect(this.opts.url, {
        ...this.connectionOptions(),
        clientId: hardwareDeviceId,
        // Discard whatever session state the broker held for the device.
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: TAKEOVER_TIMEOUT_MS,
      });
      takeover.on('connect', () => {
        console.log('[mqtt] took over client id', hardwareDeviceId, 'to end its session');
        takeover.end();
      });
      takeover.on('error', (err) => {
        console.error('[mqtt] could not end the session of', hardwareDeviceId, err.message);
        takeover.end(true);
      });
      // Fires on every path: after end(), after a refused or timed-out connect.
      takeover.on('close', () => resolve());
    });
  }
}
