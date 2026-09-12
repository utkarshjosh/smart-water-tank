import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Warning } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from './useAdminData';

interface ArchivePreview {
  tenants: number;
  devices: number;
  users: number;
  measurements: number;
}

/**
 * Confirmation for archiving a tenant. Fetches the real blast radius first, so
 * the prompt says "4 devices and 12,480 readings" rather than a vague warning.
 * Nothing here hard-deletes - the cascade rules make that destructive, so the
 * server archives and everything stays restorable.
 */
export function ArchiveTenantDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
}: {
  tenantId: string | null;
  tenantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['admin', 'tenant-archive-preview', tenantId],
    enabled: open && Boolean(tenantId),
    queryFn: () =>
      api
        .get<ArchivePreview>(`/api/v1/admin/tenants/${tenantId}/archive-preview`)
        .then((r) => r.data),
  });

  const archive = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/tenants/${tenantId}?confirm=true`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onOpenChange(false);
      toast.success(`${tenantName} archived`, {
        description: 'Its devices and users are archived too, and can be restored.',
      });
    },
    onError: (err) =>
      toast.error("Couldn't archive that tenant", {
        description: errorMessage(err, 'Please try again.'),
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {tenantName}?</DialogTitle>
          <DialogDescription>
            This hides the tenant and blocks access. Nothing is deleted, and it can be restored.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : preview.isError ? (
          <Alert variant="critical">
            <AlertTitle>Couldn&apos;t check what this affects</AlertTitle>
            <AlertDescription>{errorMessage(preview.error, 'Please try again.')}</AlertDescription>
          </Alert>
        ) : (
          preview.data && (
            <Alert variant="warning">
              <AlertTitle>This also archives</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-0.5">
                  <li className="tnum">
                    {preview.data.devices} device{preview.data.devices === 1 ? '' : 's'}
                  </li>
                  <li className="tnum">
                    {preview.data.users} user{preview.data.users === 1 ? '' : 's'} — they will not
                    be able to sign in
                  </li>
                  <li className="tnum">
                    {preview.data.measurements.toLocaleString()} stored reading
                    {preview.data.measurements === 1 ? '' : 's'} stay retained
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          )
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={archive.isPending}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={() => archive.mutate()} loading={archive.isPending}>
            <Warning size={16} weight="fill" />
            Archive tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
