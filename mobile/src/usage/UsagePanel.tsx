import { usageObservationNote } from '@aquamind/contracts';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDevices, useHourlyUsage, useTankEvents, useUsageHistory } from '@/api/queries';
import type { HourlyUsage, TankEvent } from '@/api/schemas';
import { formatLitres } from '@/lib/format';
import type { UsageSlot } from '@/lib/usage-chart';
import { dayHourSlots, eventsOnDay, localDateIn } from '@/lib/usage-offline';
import {
  describeEvent,
  formatClock,
  formatDay,
  formatTimeRange,
  hourSlots,
} from '@/lib/usage-format';
import { Button, Card, Divider, Label, Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';
import { UsageBarChart } from '@/viz/UsageBarChart';
import { Chips } from '@/usage/Chips';

type Range = 'today' | '24h';
const ACTIVITY_SHOWN = 3;
const DAY_MS = 86_400_000;

/**
 * Water used today and per hour, and the fills and draws behind it - the
 * phone's version of the webapp's UsagePanel. Everything is from the server's
 * rollups (refreshed every 5 minutes) and cut in the tank's own timezone.
 */
export function UsagePanel({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  // Open on the rolling day, so the morning's chart isn't a few empty hours.
  const [range, setRange] = useState<Range>('24h');
  const hourly = useHourlyUsage(deviceId, range);
  const events = useTankEvents(deviceId, range);
  const devices = useDevices();
  const data = hourly.data;

  // A sensor that hasn't reported for a day leaves "today" and "last 24
  // hours" empty. Show the last day it did report instead of empty bars.
  const lastSeen = devices.data?.find((d) => d.id === deviceId)?.last_seen ?? null;
  // Measured against the response's own "now" (`to`), which also keeps
  // render pure.
  if (data && lastSeen && Date.parse(data.to) - lastSeen.getTime() > DAY_MS) {
    return <OfflineUsage deviceId={deviceId} lastSeen={lastSeen} timeZone={data.timezone} />;
  }

  return (
    <>
      <Card>
        <Text variant="heading">Your water use</Text>

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
        ) : !data || hourly.isPlaceholderData ? (
          <View style={styles.placeholder} />
        ) : data.hours.length === 0 ? (
          <Text variant="caption" color="mutedForeground">
            No readings in this window yet.
          </Text>
        ) : (
          <>
            <Text variant="title" numeric>
              {formatLitres(data.totals.used_l)} used
            </Text>
            <Text variant="caption" color="mutedForeground">
              {range === '24h' ? 'In the last 24 hours' : 'Today, since midnight'}
            </Text>
            <UsageBarChart
              slots={hourSlotsOf(data)}
              accessibilityLabel="Water used and added per hour"
            />
            <Text variant="caption" color="mutedForeground">
              {usageObservationNote(data)}
            </Text>
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
          <Text variant="heading">What happened</Text>
          {events.data && (
            <Text variant="caption" color="mutedForeground">
              {events.data.totals.fills} fill{events.data.totals.fills === 1 ? '' : 's'} ·{' '}
              {events.data.totals.draws} draw
              {events.data.totals.draws === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        {events.isError ? (
          <Text variant="caption" color="crit">
            Couldn’t load activity. Pull down to try again.
          </Text>
        ) : !events.data || events.isPlaceholderData ? (
          <View style={styles.placeholderSmall} />
        ) : events.data.events.length === 0 ? (
          <Text variant="caption" color="mutedForeground">
            No activity recorded yet. Refills and water use will appear here.
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
            {events.data.events.length - ACTIVITY_SHOWN} earlier changes. Showing the latest 3.
          </Text>
        )}
      </Card>
    </>
  );
}

function EventRow({ event, timeZone }: { event: TankEvent; timeZone: string }) {
  const { colors } = useTheme();
  const fill = event.kind === 'fill';
  const Icon = fill ? ArrowDown : ArrowUp;
  return (
    <View style={styles.eventRow}>
      <View
        style={[styles.eventIcon, { backgroundColor: fill ? colors.seriesLevel : colors.muted }]}
      >
        <Icon
          size={15}
          weight="bold"
          color={fill ? colors.primaryForeground : colors.mutedForeground}
        />
      </View>
      <View style={styles.eventText}>
        <Text variant="body">{describeEvent(event)}</Text>
        <Text variant="caption" color="mutedForeground" numeric>
          {formatTimeRange(event.started_at, event.ended_at, timeZone)}
        </Text>
      </View>
      {event.ongoing && (
        <Text variant="caption" color="primary">
          At last reading
        </Text>
      )}
    </View>
  );
}

/**
 * The sensor has been quiet for over a day: say so plainly, then show the
 * last day it reported - its hours, fills and draws - with the way into the
 * full history made obvious.
 */
function OfflineUsage({
  deviceId,
  lastSeen,
  timeZone,
}: {
  deviceId: string;
  lastSeen: Date;
  timeZone: string;
}) {
  const router = useRouter();
  const day = localDateIn(lastSeen, timeZone);
  const history = useUsageHistory(deviceId, { from: day, to: day }, 'day');
  // Episodes come in 7-day windows at most; older than that, the chart
  // still shows use per hour, just without fill markers or the list.
  const week = useTankEvents(deviceId, '7d');
  const activityAvailable = !!week.data && day >= localDateIn(new Date(week.data.from), timeZone);
  const dayEvents = activityAvailable ? eventsOnDay(week.data!.events, day, timeZone) : [];
  const fills = dayEvents.filter((e) => e.kind === 'fill');
  const dayLabel = formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' });
  const since = `${formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatClock(
    lastSeen.getTime(),
    timeZone,
  )}`;
  const openHistory = () => router.push({ pathname: '/usage/[id]', params: { id: deviceId } });

  return (
    <>
      <Card accent="warn">
        <Text variant="heading">Sensor offline since {since}</Text>
        <Text variant="body" color="mutedForeground">
          No readings in the last 24 hours, so here is the last day it reported. Check its power and
          Wi-Fi.
        </Text>
      </Card>

      <Card>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Label>{`Used on ${dayLabel}`}</Label>
            <Text variant="title" numeric>
              {history.data ? formatLitres(history.data.totals.used_l) : '—'}
            </Text>
            <Text variant="caption" color="mutedForeground">
              Recorded stretches only
            </Text>
          </View>
          <View style={[styles.headText, styles.alignEnd]}>
            <Label>Tank filled</Label>
            <Text variant="heading" numeric>
              {history.data?.totals.days_with_data
                ? `${history.data.totals.refills} time${history.data.totals.refills === 1 ? '' : 's'}`
                : '—'}
            </Text>
            {!!history.data?.totals.filled_l && (
              <Text variant="caption" color="mutedForeground" numeric>
                {formatLitres(history.data.totals.filled_l)} added
              </Text>
            )}
          </View>
        </View>

        {history.isError ? (
          <Text variant="caption" color="crit">
            Couldn’t load that day. Pull down to try again.
          </Text>
        ) : !history.data ? (
          <View style={styles.placeholder} />
        ) : (
          <UsageBarChart
            slots={dayHourSlots(history.data, fills, timeZone)}
            accessibilityLabel={`Water used and added per hour on ${dayLabel}`}
          />
        )}

        <Text variant="caption" color="mutedForeground">
          Water use during gaps is unknown.
        </Text>
        <Button title="Open usage history" onPress={openHistory} feedback="selection" />
      </Card>

      <Card>
        <View style={styles.headRow}>
          <Label>{`Activity on ${dayLabel}`}</Label>
          {activityAvailable && (
            <Text variant="caption" color="mutedForeground">
              {fills.length} fill{fills.length === 1 ? '' : 's'} · {dayEvents.length - fills.length}{' '}
              draw
              {dayEvents.length - fills.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        {!week.data ? (
          <View style={styles.placeholderSmall} />
        ) : !activityAvailable ? (
          <Text variant="caption" color="mutedForeground">
            Detailed activity is unavailable for this date.
          </Text>
        ) : dayEvents.length === 0 ? (
          <Text variant="caption" color="mutedForeground">
            No fills or noticeable draws that day.
          </Text>
        ) : (
          [...dayEvents]
            .reverse()
            .slice(0, ACTIVITY_SHOWN)
            .map((event, i) => (
              <View key={event.id} style={styles.eventGap}>
                {i > 0 && <Divider />}
                <EventRow event={event} timeZone={timeZone} />
              </View>
            ))
        )}
      </Card>
    </>
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
      usedL: hour?.used_l ?? null,
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
  eventIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  eventText: { flex: 1, gap: 2 },
});
