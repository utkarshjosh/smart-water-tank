import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BellRinging, CheckCircle, Check, X } from '@phosphor-icons/react';
import api from '@/lib/api';
import { markAlertsRead } from '@/lib/alert-actions';
import { relativeTime } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { deviceKeys, useAlerts, type AlertItem } from './useDevice';

const SEVERITY: Record<AlertItem['severity'], 'critical' | 'serious' | 'warning' | 'brand'> = {
  critical: 'critical',
  high: 'serious',
  medium: 'warning',
  low: 'brand',
};

export default function AlertsTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const alerts = useAlerts(deviceId);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const key = deviceKeys.alerts(deviceId);
  const unread = alerts.data?.filter((a) => !a.acknowledged) ?? [];
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ['devices'] }),
    ]);
  };
  const read = useMutation({
    mutationFn: (ids: string[]) =>
      markAlertsRead(ids, (id) =>
        api.post(`/api/v1/user/devices/${deviceId}/alerts/${id}/acknowledge`)
      ),
    onSuccess: ({ succeeded, failed }) => {
      queryClient.setQueryData<AlertItem[]>(key, (old) =>
        old?.map((a) => (succeeded.includes(a.id) ? { ...a, acknowledged: true } : a))
      );
      if (failed.length)
        toast.error(
          `${failed.length} alert${failed.length === 1 ? '' : 's'} couldn’t be marked as read`,
          { description: 'Please try again. Successfully updated alerts have been kept.' }
        );
      else
        toast.success(
          succeeded.length === 1 ? 'Marked as read' : `${succeeded.length} alerts marked as read`
        );
    },
    onError: () => toast.error('Couldn’t mark alerts as read. Please try again.'),
    onSettled: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/user/devices/${deviceId}/alerts/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<AlertItem[]>(key, (old) => old?.filter((a) => a.id !== id));
      toast.success('Alert dismissed', {
        action: {
          label: 'Undo',
          onClick: () =>
            api
              .post(`/api/v1/user/devices/${deviceId}/alerts/${id}/restore`)
              .then(refresh)
              .catch(() => toast.error('Couldn’t restore that alert')),
        },
      });
    },
    onError: () => toast.error('Couldn’t dismiss that alert. Please try again.'),
    onSettled: refresh,
  });
  const busy = read.isPending || dismiss.isPending;
  const list = filter === 'unread' ? unread : (alerts.data ?? []);

  if (alerts.isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  if (alerts.isError)
    return (
      <Alert variant="critical">
        <AlertDescription>
          Couldn’t load alerts.{' '}
          <button type="button" className="underline" onClick={() => alerts.refetch()}>
            Try again
          </button>
        </AlertDescription>
      </Alert>
    );

  return (
    <section className="alerts-inbox">
      <div className="alerts-toolbar">
        <div>
          <h2>
            Notifications <span>{unread.length} unread</span>
          </h2>
          <p>Tank activity and the updates that need your attention.</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!unread.length || busy}
          loading={read.isPending && (read.variables?.length ?? 0) > 1}
          onClick={() => read.mutate(unread.map((a) => a.id))}
        >
          <CheckCircle size={18} />
          Mark all as read
        </Button>
      </div>
      <SegmentedControl
        aria-label="Notification filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All activity' },
          { value: 'unread', label: `Unread (${unread.length})` },
        ]}
      />
      {!list.length ? (
        <EmptyState
          icon={BellRinging}
          title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'Read notifications are still in All activity.'
              : 'Level, leak and battery updates will appear here.'
          }
        />
      ) : (
        <div className="alerts-feed">
          {list.map((alert) => (
            <article
              key={alert.id}
              className={`alert-message ${alert.acknowledged ? 'is-read' : 'is-unread'}`}
            >
              <div className="alert-message-icon">
                <BellRinging
                  size={21}
                  weight={alert.acknowledged ? 'regular' : 'duotone'}
                  aria-hidden
                />
              </div>
              <div className="alert-message-body">
                <div className="alert-message-meta">
                  <Badge variant={SEVERITY[alert.severity]}>{alert.severity}</Badge>
                  <time
                    dateTime={alert.created_at}
                    title={new Date(alert.created_at).toLocaleString()}
                  >
                    {relativeTime(alert.created_at)}
                  </time>
                  {!alert.acknowledged && <span className="alert-unread-dot" aria-label="Unread" />}
                </div>
                <p>{alert.message ?? alert.type.replaceAll('_', ' ')}</p>
                <div className="alert-message-actions">
                  {alert.acknowledged ? (
                    <span>
                      <Check size={14} />
                      Read
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => read.mutate([alert.id])}
                    >
                      <Check size={15} />
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Dismiss ${alert.message ?? alert.type}`}
                disabled={busy}
                onClick={() => dismiss.mutate(alert.id)}
                className="h-9 w-9"
              >
                <X size={16} />
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
