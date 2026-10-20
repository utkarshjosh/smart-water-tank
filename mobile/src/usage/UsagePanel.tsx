import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useHourlyUsage, useTankEvents } from '@/api/queries';
import type { HourlyUsage, TankEvent } from '@/api/schemas';
import { formatLitres } from '@/lib/format';
import type { UsageSlot } from '@/lib/usage-chart';
import { describeEvent, formatClock, formatTimeRange, hourSlots } from '@/lib/usage-format';
import { Card, Divider, Label, Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';
import { UsageBarChart } from '@/viz/UsageBarChart';
import { Chips } from '@/usage/Chips';

type Range = 'today' | '24h';
const ACTIVITY_SHOWN = 6;

/**
 * Water used today and per hour, and the fills and draws behind it - the
 * phone's version of the webapp's UsagePanel. Everything is from the server's
 * rollups (refreshed every 5 minutes) and cut in the tank's own timezone.
 */
export function UsagePanel({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  // Last 24 hours first: at 7 AM "today" is seven bars and says little.
  const [range, setRange] = useState<Range>('24h');
  const hourly = useHourlyUsage(deviceId, range);
  const events = useTankEvents(deviceId, range);
  const data = hourly.data;
  const fills = events.data?.totals.fills;

  return (
    <>
      <Card>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Label>Used today</Label>
            <Text variant="title" numeric>
              {data ? formatLitres(data.today.used_l) : '—'}
            </Text>
          </View>
          <View style={[styles.headText, styles.alignEnd]}>
            <Label>Tank filled</Label>
            <Text variant="heading" numeric>
              {fills == null ? '—' : `${fills} time${fills === 1 ? '' : 's'}`}
            </Text>
            {!!events.data?.totals.filled_l && (
              <Text variant="caption" color="mutedForeground" numeric>
                {formatLitres(events.data.totals.filled_l)} added
              </Text>
            )}
          </View>
        </View>

        <Chips
          accessibilityLabel="Usage window"
          value={range}
          onChange={setRange}
          options={[
            { value: '24h', label: 'Last 24 hours' },
            { value: 'today', label: 'Today' },
          ]}
        />

        {hourly.isError ? (
          <Text variant="caption" color="crit">
            Couldn’t load hourly usage. Pull down to try again.
          </Text>
        ) : !data ? (
          <View style={styles.placeholder} />
        ) : data.hours.length === 0 ? (
          <Text variant="caption" color="mutedForeground">
            No readings in this window yet.
          </Text>
        ) : (
          <>
            <Text variant="caption" color="mutedForeground">
              {formatLitres(data.totals.used_l)} used {range === '24h' ? 'in the last 24 hours' : 'since midnight'}
            </Text>
            <UsageBarChart slots={hourSlotsOf(data)} accessibilityLabel="Water used and added per hour" />
          </>
        )}

        <Pressable
          onPress={() => router.push({ pathname: '/usage/[id]', params: { id: deviceId } })}
          hitSlop={8}
          accessibilityRole="link"
          style={styles.link}
        >
          <Text variant="heading" color="primary">
            Usage history
          </Text>
          <CaretRight size={16} color={colors.primary} />
        </Pressable>
      </Card>

      <Card>
        <View style={styles.headRow}>
          <Label>Activity</Label>
          {events.data && (
            <Text variant="caption" color="mutedForeground">
              {events.data.totals.fills} fill{events.data.totals.fills === 1 ? '' : 's'} · {events.data.totals.draws} draw
              {events.data.totals.draws === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        {events.isError ? (
          <Text variant="caption" color="crit">
            Couldn’t load activity. Pull down to try again.
          </Text>
        ) : !events.data ? (
          <View style={styles.placeholderSmall} />
        ) : events.data.events.length === 0 ? (
          <Text variant="caption" color="mutedForeground">
            No fills or noticeable draws in this window.
          </Text>
        ) : (
          events.data.events.slice(0, ACTIVITY_SHOWN).map((event, i) => (
            <View key={event.id} style={styles.eventGap}>
              {i > 0 && <Divider />}
              <EventRow event={event} timeZone={events.data!.timezone} />
            </View>
          ))
        )}
        {!!events.data && events.data.events.length > ACTIVITY_SHOWN && (
          <Text variant="caption" color="mutedForeground">
            {events.data.events.length - ACTIVITY_SHOWN} more in this window.
          </Text>
        )}
      </Card>
    </>
  );
}

function EventRow({ event, timeZone }: { event: TankEvent; timeZone: string }) {
  const { colors } = useTheme();
  const fill = event.kind === 'fill';
  const Icon = fill ? ArrowUp : ArrowDown;
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: fill ? colors.seriesLevel : colors.muted }]}>
        <Icon size={15} weight="bold" color={fill ? colors.primaryForeground : colors.mutedForeground} />
      </View>
      <View style={styles.eventText}>
        <Text variant="body">{describeEvent(event)}</Text>
        <Text variant="caption" color="mutedForeground" numeric>
          {formatTimeRange(event.started_at, event.ended_at, timeZone)}
          {event.rate_l_per_min ? ` · ${event.rate_l_per_min.toFixed(1)} L/min` : ''}
        </Text>
      </View>
      {event.ongoing && (
        <Text variant="caption" color="primary">
          Now
        </Text>
      )}
    </View>
  );
}

/** Every hour in the window, including ones with no readings (drawn dashed). */
function hourSlotsOf(data: HourlyUsage): UsageSlot[] {
  const byStart = new Map(data.hours.map((h) => [Date.parse(h.hour_start), h]));
  return hourSlots(Date.parse(data.from), Date.parse(data.to)).map((start) => {
    const hour = byStart.get(start);
    const label = formatClock(start, data.timezone, { hourOnly: true });
    return {
      key: String(start),
      tick: label,
      title: `${label} – ${formatClock(start + 3_600_000, data.timezone, { hourOnly: true })}`,
      usedL: hour ? (hour.used_l ?? 0) : null,
      filledL: hour?.filled_l ?? 0,
    };
  });
}

const styles = StyleSheet.create({
  headRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  headText: { gap: 2 },
  alignEnd: { alignItems: 'flex-end' },
  placeholder: { height: 200 },
  placeholderSmall: { height: 60 },
  link: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: space.xs },
  eventGap: { gap: space.md },
  eventRow: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  eventIcon: { alignItems: 'center', borderRadius: 999, height: 30, justifyContent: 'center', width: 30 },
  eventText: { flex: 1, gap: 2 },
});
