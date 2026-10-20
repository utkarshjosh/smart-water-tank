/**
 * Dry run of the daily insight for one tank: prints every candidate and the
 * one that would be sent today. Read-only; sends and stores nothing.
 *
 *   npm run insights:preview -- <hardware-device-id> [--rephrase] [--at 2026-10-20T10:00:00Z]
 */
import { prisma } from '../src/lib/prisma';
import { previewInsight } from '../src/services/insight.service';

async function main() {
  const args = process.argv.slice(2);
  const deviceId = args.find((a) => !a.startsWith('--'));
  if (!deviceId) throw new Error('usage: insights:preview -- <hardware-device-id> [--rephrase] [--at ISO]');
  const at = args.includes('--at') ? new Date(args[args.indexOf('--at') + 1]) : new Date();
  const device = await prisma.device.findUniqueOrThrow({ where: { deviceId } });
  const result = await previewInsight(device, { rephrase: args.includes('--rephrase') }, at);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
