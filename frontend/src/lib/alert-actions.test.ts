import { expect, it } from 'vitest';
import { markAlertsRead } from './alert-actions';
it('reports partial success and limits bulk operations to five concurrent requests', async () => {
  let active = 0;
  let maximum = 0;
  const ids = Array.from({ length: 12 }, (_, i) => String(i));
  const result = await markAlertsRead(ids, async (id) => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    if (id === '3' || id === '9') throw new Error('offline');
  });
  expect(maximum).toBeLessThanOrEqual(5);
  expect(result.failed).toEqual(['3', '9']);
  expect(result.succeeded).toEqual(ids.filter((id) => id !== '3' && id !== '9'));
});
