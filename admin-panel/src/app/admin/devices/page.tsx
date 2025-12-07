'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { AlertCircle, Copy, CheckCircle2 } from 'lucide-react';

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
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [createdToken, setCreatedToken] = useState('');
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
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Devices</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Device
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

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

        <div className="space-y-4">
          {devices.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No devices found. Create your first device above.</p>
              </CardContent>
            </Card>
          ) : (
            devices.map((device) => (
              <Card
                key={device.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => router.push(`/admin/devices/${device.device_id}`)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            device.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <div>
                        <div className="font-medium">
                          {device.name || device.device_id}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {device.device_id} • {device.tenant_name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-medium">
                        {device.current_volume !== null && device.current_volume !== undefined
                          ? `${Number(device.current_volume).toFixed(1)}L`
                          : 'N/A'}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Badge
                          variant={
                            device.status === 'online'
                              ? 'outline'
                              : device.status === 'offline'
                              ? 'outline'
                              : 'outline'
                          }
                          className={
                            device.status === 'online'
                              ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                              : device.status === 'offline'
                              ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
                              : 'border-gray-500 bg-gray-500/10 text-gray-700 dark:text-gray-400'
                          }
                        >
                          {device.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          v{device.firmware_version || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}






