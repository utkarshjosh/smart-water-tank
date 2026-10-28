import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  insightSettingsSchema,
  insightPreviewSchema,
  insightsResponseSchema,
} from '@aquamind/contracts';
import { StyleSheet, Switch, View } from 'react-native';
import { request } from '@/api/client';
import { Card, Text, Button } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export function DailyInsightSettings({
  deviceId,
  notificationsEnabled,
}: {
  deviceId?: string;
  notificationsEnabled: boolean;
}) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ['insight-settings'],
    queryFn: () =>
      request('/api/v1/user/me/insight-settings', insightSettingsSchema),
  });
  const preview = useQuery({
    queryKey: ['device', deviceId, 'insight-preview'],
    enabled: !!deviceId,
    queryFn: () =>
      request(
        `/api/v1/user/devices/${encodeURIComponent(deviceId!)}/insight-preview`,
        insightPreviewSchema,
      ),
  });
  const insights = useQuery({
    queryKey: ['insights'],
    queryFn: () => request('/api/v1/user/me/insights', insightsResponseSchema),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      request('/api/v1/user/me/insight-settings', insightSettingsSchema, {
        method: 'PUT',
        body: { enabled },
      }),
    onSuccess: (data) => client.setQueryData(['insight-settings'], data),
  });
  const enabled = settings.data?.enabled ?? false;
  const latest = insights.data?.insights[0];
  const sentToday = latest && latest.local_date === preview.data?.local_date;
  const status = !enabled
    ? 'Off · choose whether to receive it'
    : !notificationsEnabled
      ? 'Enable notifications on this phone to receive insights'
      : sentToday
        ? 'Today’s insight is ready below'
        : preview.isError
          ? 'Couldn’t check your insight yet'
          : preview.data?.picked
            ? 'Ready for the next daily check'
            : 'On · collecting enough readings';
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text variant="heading">Daily water insight</Text>
          <Text variant="caption" color="mutedForeground">
            One useful observation about your water use. Experimental, and
            optional.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Daily water insight"
          value={enabled}
          disabled={!settings.data || toggle.isPending}
          onValueChange={(v) => toggle.mutate(v)}
          trackColor={{ true: colors.primary, false: colors.muted }}
        />
      </View>
      <View style={[styles.status, { backgroundColor: colors.muted }]}>
        <Text variant="body">{status}</Text>
        <Text variant="caption" color="mutedForeground">
          At most once a day, around midday or early evening in your tank’s
          time, and only when there is something worth saying, so a few times a
          week. Comparisons use the hours the sensor actually recorded.
        </Text>
      </View>
      {(settings.isError || toggle.isError) && (
        <>
          <Text variant="caption" color="crit">
            Couldn’t save or load this setting.
          </Text>
          <Button
            title="Try again"
            variant="ghost"
            onPress={() => {
              if (toggle.isError) toggle.reset();
              void settings.refetch();
            }}
          />
        </>
      )}
      {latest && (
        <View style={styles.copy}>
          <Text variant="caption" color="mutedForeground">
            Latest insight · {latest.local_date}
          </Text>
          <Text variant="body">{latest.text}</Text>
        </View>
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copy: { flex: 1, gap: space.xs },
  status: { borderRadius: 12, padding: space.md, gap: space.sm },
});
