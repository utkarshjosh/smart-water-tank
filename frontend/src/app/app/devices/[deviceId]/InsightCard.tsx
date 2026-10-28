import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { insightSettingsSchema, insightPreviewSchema, insightsResponseSchema, okSchema, type InsightSettings } from '@aquamind/contracts';
import api, { get, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const SETTINGS_KEY = ['insight-settings'];
const LIST_KEY = ['insights'];

/**
 * Experimental, opt-in: one push a day with an insight from the user's own
 * water data. A per-user setting, shown on each tank's settings page. The
 * list below lets the user mark what was useful, which is the point of the
 * experiment.
 */
export function InsightCard() {
  const queryClient = useQueryClient();
  const { deviceId } = useParams<{ deviceId: string }>();
  const preview = useQuery({
    queryKey: ['device', deviceId, 'insight-preview'], enabled: Boolean(deviceId),
    queryFn: () => get(`/api/v1/user/devices/${deviceId}/insight-preview`, insightPreviewSchema),
  });
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => get('/api/v1/user/me/insight-settings', insightSettingsSchema),
  });
  const insights = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => get('/api/v1/user/me/insights', insightsResponseSchema),
    enabled: settings.data != null,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put('/api/v1/user/me/insight-settings', { enabled }).then((r) => insightSettingsSchema.parse(r.data)),
    onSuccess: (data: InsightSettings) => {
      queryClient.setQueryData(SETTINGS_KEY, data);
      toast.success(data.enabled ? 'Daily insight on' : 'Daily insight off');
    },
    onError: () => toast.error("Couldn't change this setting", { description: 'Please try again.' }),
  });

  const feedback = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) =>
      post(`/api/v1/user/me/insights/${id}/feedback`, okSchema, { useful }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });

  const sent = insights.data?.insights ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily water insight</CardTitle>
        <CardDescription>
          At most one notification a day, around midday or early evening, and only when there is something worth
          knowing about your water use, so a few times a week. Optional and off by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="daily-insight"
            checked={settings.data?.enabled ?? false}
            disabled={!settings.data || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v === true)}
          />
          <Label htmlFor="daily-insight">Send me a daily water insight</Label>
        </div>
        <div className="rounded-xl bg-surface-sunk p-4 text-caption text-ink-2" role="status">
          <p className="font-medium">{settings.isError ? 'Couldn’t check this setting' : !settings.data ? 'Checking your preference…' : !settings.data.enabled ? 'Currently off' : sent[0]?.local_date === preview.data?.local_date ? 'Today’s insight is saved below' : preview.isError ? 'Couldn’t check today’s insight' : preview.data?.picked ? 'On · ready for the next daily check' : 'On · collecting enough readings'}</p>
          <p className="mt-1 leading-relaxed text-ink-3">Comparisons use only the hours the sensor recorded on both days. After an offline period, allow a few days to build a reliable picture. Notifications also need to be enabled on your phone.</p>
          {settings.isError && <button className="mt-2 text-brand underline" onClick={() => settings.refetch()}>Try again</button>}
        </div>
        {insights.isError && <p className="text-caption text-critical-text">Couldn’t load saved insights. <button className="underline" onClick={() => insights.refetch()}>Try again</button></p>}
        {sent.length === 0 && settings.data?.enabled && <p className="text-caption text-ink-3">No insights saved yet. Your first useful observation will appear here.</p>}
        {sent.length > 0 && (
          <ul className="space-y-3">
            {sent.slice(0, 7).map((i) => (
              <li key={i.id} className="text-sm">
                <div className="text-ink-3">{i.local_date}</div>
                <div>{i.text}</div>
                <div className="mt-1 flex gap-2">
                  <Button
                    size="sm"
                    variant={i.useful === true ? 'primary' : 'secondary'}
                    disabled={feedback.isPending}
                    onClick={() => feedback.mutate({ id: i.id, useful: true })}
                  >
                    Useful
                  </Button>
                  <Button
                    size="sm"
                    variant={i.useful === false ? 'primary' : 'secondary'}
                    disabled={feedback.isPending}
                    onClick={() => feedback.mutate({ id: i.id, useful: false })}
                  >
                    Not useful
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
