/**
 * Dry run of the daily insight for one tank. Read-only; sends and stores nothing.
 *
 *   npm run insights:preview -- <hardware-device-id> [--rephrase] [--at 2026-10-20T10:00:00Z]
 *     prints every candidate for the current slot and the one that would be sent
 *
 *   npm run insights:preview -- <hardware-device-id> --replay 14
 *     replays the midday and evening slots of the last 14 days: what would have
 *     been sent each day, with the recency penalty applied
 */
import { prisma } from '../src/lib/prisma';
import { previewInsight, replayInsights } from '../src/services/insight.service';
import { timeZoneOf } from '../src/services/rollup.service';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const deviceId = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(at|replay)$/));
  if (!deviceId)
    throw new Error('usage: insights:preview -- <hardware-device-id> [--rephrase] [--at ISO] [--replay DAYS]');
  const at = flag('--at') ? new Date(flag('--at')!) : new Date();
  const device = await prisma.device.findUniqueOrThrow({ where: { deviceId } });

  if (flag('--replay')) {
    const rows = await replayInsights(device, Number(flag('--replay')), at);
    for (const r of rows) {
      // The tank's zone, with the same default the slots are decided in - not the server's.
      const local = new Date(r.at).toLocaleTimeString('en-IN', { timeZone: timeZoneOf(device), hour: 'numeric', minute: '2-digit' });
      console.log(`${r.date} ${r.slot.padEnd(7)} ${local.padStart(8)}  bar ${r.bar}`);
      console.log(r.sent ? `  SENT ${r.sent.kind} ${r.sent.score}: ${r.sent.text}` : '  nothing sent');
      for (const c of r.candidates) console.log(`    ${c.kind} ${c.score} (after recency ${c.adjusted}): ${c.text}`);
    }
    return;
  }

  const result = await previewInsight(device, { rephrase: args.includes('--rephrase') }, at);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
