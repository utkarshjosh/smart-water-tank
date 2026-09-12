import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Plus } from '@phosphor-icons/react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, type AdminTenant } from '../_shared/useAdminData';

/**
 * Provisioning a device, split out of the 458-line list page. Two steps: the
 * form, then the one-time token, which is the only chance to copy it.
 */
export function CreateDeviceDialog({ tenants }: { tenants: AdminTenant[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [form, setForm] = useState({ device_id: '', tenant_id: '', name: '' });
  const [formError, setFormError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api
        .post<{ token: string }>('/api/v1/admin/devices', {
          device_id: form.device_id.trim(),
          tenant_id: form.tenant_id,
          name: form.name.trim() || undefined,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      setToken(data.token);
      setOpen(false);
      setForm({ device_id: '', tenant_id: '', name: '' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] });
    },
    onError: (err) => setFormError(errorMessage(err, 'Failed to create the device.')),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.device_id.trim()) return setFormError('A device ID is required.');
    if (!form.tenant_id) return setFormError('Pick the tenant this device belongs to.');
    create.mutate();
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Token copied to clipboard');
    } catch {
      // Clipboard access can be refused; the token is on screen to copy by hand.
      toast.error('Could not copy automatically', { description: 'Select the token and copy it.' });
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} weight="bold" />
        Create device
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a device</DialogTitle>
            <DialogDescription>
              Register a sensor against a tenant. You&apos;ll get a one-time token to flash onto it.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="device-id">Device ID</Label>
              <Input
                id="device-id"
                placeholder="tank-001"
                value={form.device_id}
                onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                disabled={create.isPending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant">Tenant</Label>
              <Select
                value={form.tenant_id}
                onValueChange={(value) => setForm({ ...form, tenant_id: value })}
                disabled={create.isPending}
              >
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="Pick a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="device-name">Name (optional)</Label>
              <Input
                id="device-name"
                placeholder="Roof tank"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={create.isPending}
              />
            </div>

            {formError && (
              <Alert variant="critical">
                <AlertTitle>Could not create the device</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create device
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-time token. Shown separately so closing the form cannot lose it. */}
      <Dialog open={token !== ''} onOpenChange={(next) => !next && setToken('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device created</DialogTitle>
            <DialogDescription>Flash this token onto the device.</DialogDescription>
          </DialogHeader>

          <Alert variant="warning">
            <AlertTitle>Copy it now</AlertTitle>
            <AlertDescription>
              This token is shown once and cannot be retrieved later.
            </AlertDescription>
          </Alert>

          <Textarea readOnly value={token} rows={4} className="font-mono text-caption" />

          <DialogFooter>
            <Button variant="secondary" onClick={() => setToken('')}>
              Done
            </Button>
            <Button onClick={copyToken}>
              <Copy size={16} />
              Copy token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
