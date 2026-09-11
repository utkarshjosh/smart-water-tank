import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import { formatAge, formatPercent } from '@/lib/format';
import { palette } from '@/ui/tokens';
import type { WidgetTank } from '@/widget/state';

/**
 * The 2x2 home-screen widget.
 *
 * Rendered to Android RemoteViews, which is a much smaller vocabulary than
 * React Native: no Skia, no Reanimated, a fixed set of layout primitives. The
 * glass tank is therefore an inline SVG string sized to the widget rather than
 * the Skia component — same visual language, different renderer.
 *
 * Launchers are usually dark and a widget cannot read the app's theme, so this
 * commits to the dark palette and paints every colour explicitly.
 */

const c = palette.dark;
type Hex = `#${string}`;
const STATUS = { ok: '#3fc397', warn: '#e5a53a', crit: '#f4726f', offline: '#64748b' } as const satisfies Record<string, Hex>;

function waterColor(tank: WidgetTank): Hex {
  if (tank.alert === 'leak') return STATUS.crit;
  if (tank.alert === 'low') return STATUS.warn;
  return c.chart2;
}

/** Ribbed tank with a flat surface — RemoteViews gets no animation. */
function tankSvg(tank: WidgetTank): string {
  const pct = tank.levelPercent === null ? 0 : Math.max(0, Math.min(100, tank.levelPercent));
  const h = 96;
  const w = 30;
  const waterHeight = (h - 4) * (pct / 100);
  const y = 2 + (h - 4 - waterHeight);
  const opacity = tank.levelPercent === null ? 0.25 : 1;
  const ribs = [1, 2, 3, 4]
    .map((i) => `<line x1="3" y1="${2 + ((h - 4) / 5) * i}" x2="${w - 3}" y2="${2 + ((h - 4) / 5) * i}" stroke="${c.border}" stroke-width="1" opacity="0.6"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="9" fill="${c.muted}" opacity="0.45"/>
    <clipPath id="tank"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="9"/></clipPath>
    <g clip-path="url(#tank)" opacity="${opacity}">
      <rect x="2" y="${y}" width="${w - 4}" height="${waterHeight}" fill="${waterColor(tank)}"/>
      <rect x="2" y="${y}" width="${w - 4}" height="1.5" fill="#ffffff" opacity="0.55"/>
    </g>
    ${ribs}
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="9" fill="none" stroke="${c.border}" stroke-width="1.5"/>
  </svg>`;
}

const frame = {
  height: 'match_parent',
  width: 'match_parent',
  backgroundColor: c.card,
  borderRadius: 16,
  padding: 12,
} as const;

export function TankWidget({ tank }: { tank: WidgetTank | null }) {
  // No data at all means the app has never signed in on this device. Say that,
  // rather than showing a zero that looks like an empty tank.
  if (!tank) {
    return (
      <FlexWidget style={{ ...frame, justifyContent: 'center', alignItems: 'center' }} clickAction="OPEN_APP">
        <TextWidget text="AquaMind" style={{ fontSize: 13, fontWeight: '600', color: c.foreground }} />
        <TextWidget
          text="Open the app to connect a tank"
          style={{ fontSize: 11, color: c.mutedForeground, marginTop: 4 }}
        />
      </FlexWidget>
    );
  }

  const statusColor = !tank.online ? STATUS.offline : tank.alert ? waterColor(tank) : STATUS.ok;
  const age = formatAge(tank.asOf === null ? null : new Date(tank.asOf));

  return (
    <FlexWidget
      style={{ ...frame, flexDirection: 'row', alignItems: 'center' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `aquamind://device/${tank.deviceId}` }}
    >
      <SvgWidget svg={tankSvg(tank)} style={{ width: 30, height: 96, marginRight: 12 }} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor, marginRight: 5 }} />
          <TextWidget
            text={tank.name}
            maxLines={1}
            style={{ fontSize: 11, fontWeight: '500', color: c.mutedForeground }}
          />
        </FlexWidget>
        <TextWidget
          text={formatPercent(tank.levelPercent)}
          style={{ fontSize: 30, fontWeight: '700', color: c.foreground, marginTop: 2 }}
        />
        <TextWidget
          text={
            tank.volumeL === null
              ? 'sensor unreadable'
              : tank.capacityL === null
                ? `${Math.round(tank.volumeL).toLocaleString()} L`
                : `${Math.round(tank.volumeL).toLocaleString()} / ${Math.round(tank.capacityL).toLocaleString()} L`
          }
          maxLines={1}
          style={{ fontSize: 11, color: c.mutedForeground }}
        />
        <TextWidget
          text={tank.stale ? `last good reading ${age}` : age}
          maxLines={1}
          style={{ fontSize: 10, color: c.mutedForeground, marginTop: 4 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
