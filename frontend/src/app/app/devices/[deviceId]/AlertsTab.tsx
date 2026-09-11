import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BellRinging, CheckCircle } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { deviceKeys, useAlerts, type AlertItem } from './useDevice';

const SEVERITY: Record<AlertItem['severity'], { variant: 'critical' | 'serious' | 'warning' | 'brand'; label: string }> = {
  critical: { variant: 'critical', label: 'Critical' },
  high: { variant: 'serious', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'brand', label: 'Low' },
};

export default function AlertsTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const alerts = useAlerts(deviceId);

  /**
   * Optimistic: the row commits instantly and rolls back on failure. The old
   * code also updated local state eagerly but swallowed the error into
   * console.error, so a failed acknowledge looked like a success forever.
   */
  const acknowledge = useMutation({
    mutationFn: (alertId: string) =>
      api.post(`/api/v1/user/devices/${deviceId}/alerts/${alertId}/acknowledge`),
    onMutate: async (alertId) => {
      const key = deviceKeys.alerts(deviceId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AlertItem[]>(key);
      queryClient.setQueryData<AlertItem[]>(key, (old) =>
        old?.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
      return { previous };
    },
    onError: (_err, _alertId, context) => {
      queryClient.setQueryData(deviceKeys.alerts(deviceId), context?.previous);
      toast.error("Couldn't acknowledge that alert", { description: 'Check your connection and try again.' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: deviceKeys.alerts(deviceId) }),
  });

  if (alerts.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!alerts.data?.length) {
    return (
      <EmptyState
        icon={BellRinging}
        title="No alerts"
        description="You will see leak, low-level and battery warnings here."
      />
    );
  }

  return (
    <Card className="divide-y divide-hairline">
      {alerts.data.map((alert) => {
        const severity = SEVERITY[alert.severity];
        return (
          <div key={alert.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={severity.variant}>{severity.label}</Badge>
                <span className="text-caption text-ink-3">
                  {new Date(alert.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1.5 text-body text-ink-1">{alert.message ?? alert.type}</p>
            </div>
            {alert.acknowledged ? (
              <span className="flex shrink-0 items-center gap-1 text-caption text-good-text">
                <CheckCircle size={16} weight="fill" aria-hidden />
                Acknowledged
              </span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => acknowledge.mutate(alert.id)}
                className="shrink-0"
              >
                Acknowledge
              </Button>
            )}
          </div>
        );
      })}
    </Card>
  );
}
