import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ThumbsDown, ThumbsUp } from 'phosphor-react-native';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/endpoints';
import { queryKeys } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { Button, Divider, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, useTheme } from '@/ui/theme';

type Insight = Awaited<ReturnType<typeof api.listInsights>>[number];

/** "2026-11-10" as "Tue 10 Nov", read as a calendar day rather than a moment in UTC. */
function formatDay(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Every daily insight this account was sent, newest first, each with a
 * yes-or-no on whether it was useful. That answer is the reason the feature
 * exists while it is experimental, so it is one tap and can be changed.
 */
export default function InsightsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const insights = useQuery({ queryKey: queryKeys.insights, queryFn: () => api.listInsights() });

  const rate = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) => api.setInsightFeedback(id, useful),
    // Shown at once and rolled back if the server says no.
    onMutate: async ({ id, useful }) => {
      await client.cancelQueries({ queryKey: queryKeys.insights });
      const before = client.getQueryData<Insight[]>(queryKeys.insights);
      client.setQueryData<Insight[]>(queryKeys.insights, (list) =>
        list?.map((insight) => (insight.id === id ? { ...insight, useful } : insight))
      );
      return { before };
    },
    onError: (_error, _vars, context) => client.setQueryData(queryKeys.insights, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.insights }),
  });

  const list = insights.data ?? [];
  // Only worth naming the tank when there is more than one to tell apart.
  const manyTanks = new Set(list.map((insight) => insight.device_id)).size > 1;

  return (
    <Screen
      title="Water insights"
      subtitle="One a day, from your own readings"
      onBack={() => router.back()}
      onRefresh={() => insights.refetch()}
      refreshing={insights.isRefetching}
    >
      {insights.isPending ? (
        <Text variant="body" color="mutedForeground">
          Loading…
        </Text>
      ) : insights.isError && list.length === 0 ? (
        <View style={styles.block}>
          <Text variant="body" color="mutedForeground">
            Couldn’t load your insights.
          </Text>
          <Button title="Try again" variant="secondary" onPress={() => insights.refetch()} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.block}>
          <Text variant="heading">Nothing yet</Text>
          <Text variant="body" color="mutedForeground">
            Your first insight shows up here the day after you turn the daily insight on in Settings.
          </Text>
        </View>
      ) : (
        <>
          {rate.isError && (
            <Text variant="caption" color="crit">
              Couldn’t save that answer. Try again.
            </Text>
          )}
          {list.map((insight, index) => (
            <Fragment key={insight.id}>
              {index > 0 && <Divider />}
              <View style={styles.item}>
                <Text variant="caption" color="mutedForeground" numeric>
                  {formatDay(insight.local_date)}
                  {manyTanks && insight.device_name ? ` · ${insight.device_name}` : ''}
                </Text>
                <Text variant="body">{insight.text}</Text>
                <View style={styles.rating}>
                  <Text variant="caption" color="mutedForeground" style={styles.ratingLabel}>
                    {insight.useful === null ? 'Was this useful?' : insight.useful ? 'Marked useful' : 'Marked not useful'}
                  </Text>
                  <Rate
                    kind="up"
                    active={insight.useful === true}
                    onPress={() => rate.mutate({ id: insight.id, useful: true })}
                  />
                  <Rate
                    kind="down"
                    active={insight.useful === false}
                    onPress={() => rate.mutate({ id: insight.id, useful: false })}
                  />
                </View>
              </View>
            </Fragment>
          ))}
        </>
      )}
    </Screen>
  );
}

function Rate({ kind, active, onPress }: { kind: 'up' | 'down'; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const Icon = kind === 'up' ? ThumbsUp : ThumbsDown;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={kind === 'up' ? 'Useful' : 'Not useful'}
      accessibilityState={{ selected: active }}
      style={[
        styles.rate,
        { backgroundColor: active ? colors.primary : 'transparent', borderColor: active ? colors.primary : colors.border },
      ]}
    >
      <Icon size={18} weight={active ? 'fill' : 'regular'} color={active ? colors.primaryForeground : colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  item: { gap: space.sm },
  rating: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  ratingLabel: { flex: 1 },
  rate: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
