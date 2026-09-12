import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Buildings, ShareNetwork, Trash, UserPlus } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeviceShares, type DeviceShare } from './useDevice';

const errorText = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error ?? fallback;
};

/**
 * Per-device sharing. user_device_mappings was read by access control as a
 * valid grant path but had no writer, so this is the first UI that can
 * populate it.
 */
export function SharesCard({ deviceId }: { deviceId?: string }) {
  const queryClient = useQueryClient();
  const shares = useDeviceShares(deviceId);
  const [email, setEmail] = useState('');

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['device', deviceId, 'shares'] });

  const share = useMutation({
    mutationFn: (target: string) =>
      api.post(`/api/v1/user/devices/${deviceId}/shares`, { email: target.trim() }),
    onSuccess: () => {
      setEmail('');
      invalidate();
      toast.success('Access granted');
    },
    onError: (err) =>
      toast.error("Couldn't share this device", {
        // The server distinguishes "no such account" from "already has access
        // via their tenant"; both are actionable, so show them verbatim.
        description: errorText(err, 'Please try again.'),
      }),
  });

  const unshare = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/user/devices/${deviceId}/shares/${userId}`),
    onSuccess: () => {
      invalidate();
      toast.success('Access revoked');
    },
    onError: (err) => toast.error("Couldn't revoke access", { description: errorText(err, '') }),
  });

  const rows: DeviceShare[] = [...(shares.data?.members ?? []), ...(shares.data?.shares ?? [])];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who can see this tank</CardTitle>
        <CardDescription>
          Everyone in your household sees it already. Share it with someone outside by the email
          they signed up with.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {shares.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((row) => (
              <li key={`${row.via}-${row.user_id}`} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-ink-2">
                  {row.via === 'tenant' ? (
                    <Buildings size={15} weight="fill" aria-hidden />
                  ) : (
                    <ShareNetwork size={15} weight="fill" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink-1">{row.name || row.email}</p>
                  {row.name && <p className="truncate text-caption text-ink-3">{row.email}</p>}
                </div>
                {row.via === 'tenant' ? (
                  <Badge variant="neutral">Household</Badge>
                ) : (
                  <>
                    <Badge variant="brand">Shared</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Revoke access for ${row.email}`}
                      onClick={() => unshare.mutate(row.user_id)}
                      loading={unshare.isPending && unshare.variables === row.user_id}
                      className="h-9 w-9"
                    >
                      <Trash size={16} />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) share.mutate(email);
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="share-email">Share with</Label>
            <Input
              id="share-email"
              type="email"
              placeholder="them@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={share.isPending}
            />
          </div>
          <Button type="submit" loading={share.isPending} disabled={!email.trim()}>
            <UserPlus size={16} weight="bold" />
            Share
          </Button>
        </form>
        <p className="text-caption text-ink-3">
          They need an AquaMind account already — sharing does not send an invite.
        </p>
      </CardContent>
    </Card>
  );
}
