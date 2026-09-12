import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlertNotification } from '../services/alert.service';
import { toStringMap } from '../services/fcm.service';

const base = {
  alertId: 'a1b2',
  message: 'Tank is low (12%)',
  deviceName: 'Roof tank',
  hardwareDeviceId: 'AQM-0042',
  asOf: new Date('2026-09-12T08:30:00.000Z'),
};

test('title reads on a lock screen, not as an enum', () => {
  const { title } = buildAlertNotification({ ...base, type: 'tank_low', severity: 'critical' });
  assert.equal(title, 'Tank low · Roof tank');
});

test('severity picks the notification channel', () => {
  const channel = (severity: 'low' | 'medium' | 'high' | 'critical') =>
    buildAlertNotification({ ...base, type: 'tank_low', severity }).data.channel_id;

  assert.equal(channel('critical'), 'aquamind_critical_v1');
  assert.equal(channel('high'), 'aquamind_high_v1');
  // Anything below "high" stays quiet rather than inventing a channel.
  assert.equal(channel('medium'), 'aquamind_info_v1');
  assert.equal(channel('low'), 'aquamind_info_v1');
});

test('data carries the hardware device id the app addresses devices by', () => {
  const { data } = buildAlertNotification({ ...base, type: 'leak_detected', severity: 'critical' });
  assert.equal(data.device_id, 'AQM-0042');
  assert.equal(data.device_name, 'Roof tank');
  assert.equal(data.as_of, '2026-09-12T08:30:00.000Z');
});

test('extras reach the payload so the widget can repaint without a request', () => {
  const { data } = buildAlertNotification({
    ...base,
    type: 'tank_low',
    severity: 'critical',
    online: true,
    extras: { level_percent: '11.8' },
  });
  assert.equal(data.level_percent, '11.8');
  assert.equal(data.online, true);
});

test('every data value survives as a string - FCM rejects any other type', () => {
  const { data } = buildAlertNotification({
    ...base,
    type: 'battery_low',
    severity: 'medium',
    online: false,
    extras: { level_percent: 42.5 },
  });

  const wire = toStringMap(data);
  for (const [key, value] of Object.entries(wire)) {
    assert.equal(typeof value, 'string', `${key} must serialise to a string`);
  }
  assert.equal(wire.online, 'false');
  assert.equal(wire.level_percent, '42.5');
});

test('undefined values are dropped rather than sent as "undefined"', () => {
  // `online` is undefined when the device row vanished mid-alert.
  const { data } = buildAlertNotification({ ...base, type: 'device_offline', severity: 'high' });
  const wire = toStringMap(data);
  assert.equal('online' in wire, false);
});
