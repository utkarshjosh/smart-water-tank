import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { queryKeys, useAlertFeed } from '@/api/queries';
import type { FeedAlert } from '@/api/schemas';
import { haptics } from '@/feedback/haptics';
import { formatAge, formatAlertType } from '@/lib/format';
import { Button, Card, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { space, useTheme, type Colors } from '@/ui/theme';

/**
 * Activity — one feed across every tank, grouped by day.
 *
 * The old app fetched alerts per device and sorted client-side; this is a
 * single cursor-paginated request (backend `/user/alerts`).
 */
export default function AlertsScreen() {
  const router = useRouter();
  const feed = useAlertFeed();

  const acknowledge = useMutation({
    mutationFn: (alertId: string) => api.acknowledgeAlertById(alertId),
    // Optimistic: the row settles instantly and reverts if the call fails.
    onMutate: async (alertId) => {
      haptics.selection();
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts });
      const previous = queryClient.getQueryData(queryKeys.alerts);
      queryClient.setQueryData(queryKeys.alerts, (old: unknown) => {
        const data = old as { pages: { alerts: FeedAlert[]; unacknowledged_count: number }[] } | undefined;
        if (!data) return old;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            unacknowledged_count: Math.max(0, page.unacknowledged_count - 1),
            alerts: page.alerts.map((alert) =>
              alert.id === alertId ? { ...alert, acknowledged: true } : alert
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_error, _alertId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.alerts, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  });

  const alerts = useMemo(() => feed.data?.pages.flatMap((page) => page.alerts) ?? [], [feed.data]);
  const unacknowledged = feed.data?.pages[0]?.unacknowledged_count ?? 0;

  // Grouped by day: alert timestamps are only useful relative to "today".
  const groups = useMemo(() => {
    const byDay = new Map<string, FeedAlert[]>();
    for (const alert of alerts) {
      const key = alert.created_at.toDateString();
      const bucket = byDay.get(key);
      if (bucket) bucket.push(alert);
      else byDay.set(key, [alert]);
    }
    return [...byDay.entries()];
  }, [alerts]);

  return (
    <Screen
      title="Activity"
      subtitle={unacknowledged > 0 ? `${unacknowledged} unacknowledged` : 'All caught up'}
      onBack={() => router.back()}
      onRefresh={() => void feed.refetch()}
      refreshing={feed.isRefetching}
    >
      {feed.isPending && !feed.data && <ActivityIndicator />}

      {!feed.isPending && alerts.length === 0 && (
        <Card>
          <Text variant="heading">Nothing has gone wrong</Text>
          <Text variant="body" color="mutedForeground">
            Tank alerts, low battery and offline notices show up here.
          </Text>
        </Card>
      )}

      {groups.map(([day, dayAlerts]) => (
        <View key={day} style={styles.group}>
          <Label>{dayLabel(day)}</Label>
          {dayAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAcknowledge={() => acknowledge.mutate(alert.id)}
              onOpen={() => router.push(`/device/${alert.device_id}`)}
            />
          ))}
        </View>
      ))}

      {feed.hasNextPage && (
        <Button
          title="Load older"
          variant="ghost"
          onPress={() => void feed.fetchNextPage()}
          loading={feed.isFetchingNextPage}
        />
      )}
    </Screen>
  );
}

function dayLabel(day: string): string {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return day;
}

const TONE: Record<string, keyof Colors> = {
  critical: 'crit',
  high: 'warn',
  medium: 'mutedForeground',
  low: 'mutedForeground',
};

function AlertRow({
  alert,
  onAcknowledge,
  onOpen,
}: {
  alert: FeedAlert;
  onAcknowledge: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const tone = TONE[alert.severity] ?? 'mutedForeground';

  return (
    <Pressable onPress={onOpen} accessibilityRole="button">
      <Card accent={alert.acknowledged ? undefined : tone} style={alert.acknowledged ? styles.acked : undefined}>
        <View style={styles.rowTop}>
          <Text variant="heading">{formatAlertType(alert.type)}</Text>
          <Text variant="caption" color="mutedForeground">
            {formatAge(alert.created_at)}
          </Text>
        </View>

        <Text variant="body" color="mutedForeground">
          {alert.message ?? alert.device_name}
        </Text>

        <View style={styles.rowBottom}>
          <Text variant="caption" color="mutedForeground">
            {alert.device_name}
          </Text>
          {alert.acknowledged ? (
            <Text variant="label" color="ok" style={styles.upper}>
              Acknowledged
            </Text>
          ) : (
            <Pressable
              onPress={onAcknowledge}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Acknowledge ${formatAlertType(alert.type)}`}
              style={[styles.ack, { borderColor: colors.border }]}
            >
              <Text variant="caption" color="primary">
                Acknowledge
              </Text>
            </Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  acked: { opacity: 0.62 },
  rowTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  upper: { textTransform: 'uppercase' },
  ack: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: 5 },
});
