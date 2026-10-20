import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { insightSettingsSchema, insightsResponseSchema, okSchema, type InsightSettings } from '@aquamind/contracts';
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
        <CardTitle>Experimental: daily insight</CardTitle>
        <CardDescription>
          At most one notification a day, between 9 AM and 8 PM, with something worth knowing about your water use.
          Off by default.
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
          <Label htmlFor="daily-insight">Experimental: daily insight</Label>
        </div>
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
                    onClick={() => feedback.mutate({ id: i.id, useful: true })}
                  >
                    Useful
                  </Button>
                  <Button
                    size="sm"
                    variant={i.useful === false ? 'primary' : 'secondary'}
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
