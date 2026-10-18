/**
 * Backfill hourly_usage and daily_summaries for every device.
 *
 *   npm run rollups:rebuild            # last 90 days
 *   npm run rollups:rebuild -- 30      # last 30 days
 *
 * Safe to re-run: each day is rebuilt whole from its readings. Leak alerts
 * are only raised for yesterday and today, so a backfill doesn't send old ones.
 */
import { prisma } from '../src/lib/prisma';
import { REBUILD_DAYS, rebuildRecentRollups } from '../src/services/rollup.service';

async function main() {
  const days = Number(process.argv[2] ?? REBUILD_DAYS);
  const devices = await prisma.device.findMany({ where: { archivedAt: null }, select: { id: true, deviceId: true } });
  for (const [i, device] of devices.entries()) {
    console.log(`[${i + 1}/${devices.length}] ${device.deviceId}: rebuilding ${days} days`);
    await rebuildRecentRollups(device.id, days);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
