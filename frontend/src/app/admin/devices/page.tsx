import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Building2, Copy, Cpu, Droplets, Plus, Radio, Search } from 'lucide-react';
import MeasurementExportDialog from '@/components/MeasurementExportDialog';

interface Device {
  id: string;
  device_id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  current_volume: number | null;
  last_measurement: string | null;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
  created_at: string;
  device_count: number;
  user_count: number;
}

export default function DevicesPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [createdToken, setCreatedToken] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    device_id: '',
    tenant_id: '',
    name: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDevices();
    fetchTenants();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await api.get('/api/v1/admin/devices');
      setDevices(response.data.devices);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await api.get('/api/v1/admin/tenants');
      setTenants(response.data.tenants);
    } catch (err: any) {
      console.error('Failed to fetch tenants:', err);
    }
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    // Client-side validation
    if (!formData.device_id.trim()) {
      setFormError('Device ID is required');
      setSubmitting(false);
      return;
    }

    if (!formData.tenant_id) {
      setFormError('Tenant is required');
      setSubmitting(false);
      return;
    }

    try {
      const response = await api.post('/api/v1/admin/devices', {
        device_id: formData.device_id.trim(),
        tenant_id: formData.tenant_id,
        name: formData.name.trim() || undefined,
      });

      // Show token modal
      setCreatedToken(response.data.token);
      setShowCreateModal(false);
      setShowTokenModal(true);

      // Reset form
      setFormData({
        device_id: '',
        tenant_id: '',
        name: '',
      });

      // Refresh device list
      fetchDevices();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create device';
      setFormError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(createdToken);
    alert('Token copied to clipboard!');
  };

  const closeTokenModal = () => {
    setShowTokenModal(false);
    setCreatedToken('');
  };

  const onlineDevices = devices.filter((device) => device.status === 'online').length;
  const offlineDevices = devices.filter((device) => device.status === 'offline').length;
  const assignedTenants = new Set(devices.map((device) => device.tenant_id)).size;
  const totalVolume = devices.reduce((sum, device) => sum + (Number(device.current_volume) || 0), 0);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredDevices = normalizedQuery
    ? devices.filter((device) =>
        [
          device.name,
          device.device_id,
          device.tenant_name,
          device.status,
          device.firmware_version,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
    : devices;

  const formatLastSeen = (value: string | null) => {
    if (!value) return 'Never seen';

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'Unknown';

    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;

    return new Date(value).toLocaleDateString();
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Device inventory</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Provisioned sensors, tenant ownership, and latest reporting state.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MeasurementExportDialog
              devices={devices.map((device) => ({
                id: device.device_id,
                name: device.name || device.device_id,
                context: device.tenant_name,
              }))}
              endpoint="/api/v1/admin/measurements/export"
            />
            <Button onClick={() => setShowCreateModal(true)} className="h-9 w-fit">
              <Plus className="mr-2 h-4 w-4" />
              Create device
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Devices', value: devices.length, detail: `${onlineDevices} online`, icon: Radio },
            { label: 'Offline', value: offlineDevices, detail: 'Need attention', icon: AlertCircle },
            { label: 'Tenants', value: assignedTenants, detail: 'With assigned hardware', icon: Building2 },
            { label: 'Stored volume', value: `${totalVolume.toFixed(0)}L`, detail: 'Latest readings', icon: Droplets },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{metric.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{metric.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Create Device Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Device</DialogTitle>
              <DialogDescription>
                Add a new device to the system. All fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateDevice}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="device_id">
                    Device ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="device_id"
                    value={formData.device_id}
                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant_id">
                    Tenant <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.tenant_id}
                    onValueChange={(value) => setFormData({ ...formData, tenant_id: value })}
                    required
                  >
                    <SelectTrigger id="tenant_id">
                      <SelectValue placeholder="Select a tenant" />
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

                <div className="space-y-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {formError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormError('');
                    setFormData({ device_id: '', tenant_id: '', name: '' });
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Device'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Token Display Modal */}
        <Dialog open={showTokenModal} onOpenChange={setShowTokenModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Device Created Successfully</DialogTitle>
              <DialogDescription>
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    Save this token now. It will not be shown again!
                  </AlertDescription>
                </Alert>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                readOnly
                value={createdToken}
                className="font-mono text-sm"
                rows={4}
              />
              <Button onClick={copyToken} className="w-full">
                <Copy className="mr-2 h-4 w-4" />
                Copy Token
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeTokenModal}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base font-semibold tracking-normal">Fleet list</CardTitle>
              <CardDescription>{filteredDevices.length} of {devices.length} devices shown</CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search device, tenant, status"
                className="h-9 pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {devices.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No devices found. Create your first device above.
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No devices match your search.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDevices.map((device) => (
                  <button
                    key={device.id}
                    className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 md:grid-cols-[1.4fr_1fr_0.7fr_0.7fr]"
                    onClick={() => navigate(`/admin/devices/${device.device_id}`)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          device.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-950 dark:text-white">
                          {device.name || device.device_id}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{device.device_id}</div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{device.tenant_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Tenant</div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">
                        {device.current_volume !== null && device.current_volume !== undefined
                          ? `${Number(device.current_volume).toFixed(1)}L`
                          : 'N/A'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Current volume</div>
                    </div>

                    <div className="flex items-start justify-between gap-2 md:justify-end">
                      <div className="min-w-0 md:text-right">
                        <div className="flex items-center gap-2 md:justify-end">
                          <Badge
                            variant="outline"
                            className={
                              device.status === 'online'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : device.status === 'offline'
                                ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                : 'border-slate-500 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                            }
                          >
                            {device.status}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Cpu className="h-3 w-3" />
                            v{device.firmware_version || 'N/A'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Seen {formatLastSeen(device.last_seen)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


