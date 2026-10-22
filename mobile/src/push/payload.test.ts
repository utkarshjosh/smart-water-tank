import { describe, expect, it } from 'vitest';
import { parseAlertPayload, parseNotificationPayload } from './payload';
const insight = {
  type: 'daily_insight',
  insight_id: 'i-1',
  device_id: 'tank-1',
  device_name: 'Roof tank',
  kind: 'busiest_hour',
  channel_id: 'aquamind_info_v1',
};
const alert = {
  alert_id: 'a-1',
  device_id: 'tank-1',
  type: 'tank_low',
  severity: 'high',
  channel_id: 'aquamind_low_v1',
  level_percent: '19',
};
describe('notification payloads', () => {
  it('accepts real server insight payloads for foreground display and tap routing', () => {
    expect(parseNotificationPayload(insight)?.type).toBe('daily_insight');
    expect(parseNotificationPayload(insight)?.device_id).toBe('tank-1');
  });
  it('keeps informational insights out of the tank/widget alert parser', () => {
    expect(parseAlertPayload(insight)).toBeNull();
    expect(parseNotificationPayload(alert)).toMatchObject({
      type: 'tank_low',
      level_percent: 19,
    });
  });
  it('rejects incomplete and unknown pushes', () => {
    expect(parseNotificationPayload({ ...insight, device_id: '' })).toBeNull();
    expect(
      parseNotificationPayload({ ...insight, insight_id: undefined }),
    ).toBeNull();
    expect(
      parseNotificationPayload({ type: 'other', device_id: 'tank-1' }),
    ).toBeNull();
    expect(parseNotificationPayload(null)).toBeNull();
  });
});
