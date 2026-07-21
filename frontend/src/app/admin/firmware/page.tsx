import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  FileUp,
  Cpu,
  HardDrive,
  RadioTower,
  PackageCheck,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Firmware {
  id: string;
  version: string;
  file_size: number;
  checksum: string;
  description: string;
  is_active: boolean;
  rollout_percentage: number;
  created_at: string;
}

interface Device {
  id: string;
  device_id: string;
  name: string;
  tenant_name: string;
  firmware_version: string;
}

interface Tenant {
  id: string;
  name: string;
}

type FirmwareAction = {
  type: 'unroll' | 'delete';
  firmware: Firmware;
};

export default function FirmwarePage() {
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showRolloutModal, setShowRolloutModal] = useState(false);
  const [selectedFirmware, setSelectedFirmware] = useState<Firmware | null>(null);
  const [rolloutType, setRolloutType] = useState<'devices' | 'tenants' | 'percentage'>('devices');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [rolloutPercentage, setRolloutPercentage] = useState<number>(100);
  const [rollingOut, setRollingOut] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloadingFirmwareId, setDownloadingFirmwareId] = useState<string | null>(null);
  const [firmwareAction, setFirmwareAction] = useState<FirmwareAction | null>(null);
  const [runningFirmwareAction, setRunningFirmwareAction] = useState(false);
  const [firmwareActionError, setFirmwareActionError] = useState('');

  useEffect(() => {
    fetchFirmware();
    fetchDevices();
    fetchTenants();
  }, []);

  const fetchFirmware = async () => {
    try {
      const response = await api.get('/api/v1/admin/firmware');
      setFirmware(response.data.firmware);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch firmware');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await api.get('/api/v1/admin/devices');
      setDevices(response.data.devices);
    } catch (err: any) {
      console.error('Failed to fetch devices:', err);
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

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError('');
    setSuccessMessage('');

    const formData = new FormData(e.currentTarget);
    const file = selectedFile || (formData.get('firmware') as File) || null;
    const version = formData.get('version') as string;
    const description = formData.get('description') as string;

    if (!file || !version) {
      setError('File and version are required');
      setUploading(false);
      return;
    }

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('firmware', file);
      uploadFormData.append('version', version);
      uploadFormData.append('description', description);

      await api.post('/api/v1/admin/firmware/upload', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccessMessage(`Firmware ${version} uploaded successfully!`);
      fetchFirmware();
      (e.target as HTMLFormElement).reset();
      setSelectedFile(null);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to upload firmware');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fw: Firmware) => {
    setDownloadingFirmwareId(fw.id);
    setError('');

    try {
      const response = await api.get(`/api/v1/admin/firmware/${fw.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `firmware-${fw.version}.bin`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to download firmware');
    } finally {
      setDownloadingFirmwareId(null);
    }
  };

  const openFirmwareAction = (type: FirmwareAction['type'], fw: Firmware) => {
    setFirmwareAction({ type, firmware: fw });
    setFirmwareActionError('');
    setError('');
    setSuccessMessage('');
  };

  const closeFirmwareAction = () => {
    if (runningFirmwareAction) return;
    setFirmwareAction(null);
    setFirmwareActionError('');
  };

  const handleFirmwareAction = async () => {
    if (!firmwareAction) return;

    const { type, firmware: selected } = firmwareAction;
    setRunningFirmwareAction(true);
    setFirmwareActionError('');

    try {
      if (type === 'unroll') {
        const response = await api.post(`/api/v1/admin/firmware/${selected.id}/unroll`);
        const cancelled = Number(response.data.cancelled_assignments || 0);
        setSuccessMessage(
          `Firmware ${selected.version} unrolled. ${cancelled} in-flight assignment${cancelled === 1 ? '' : 's'} cancelled.`
        );
      } else {
        const response = await api.delete(`/api/v1/admin/firmware/${selected.id}`);
        setSuccessMessage(
          response.data.file_deleted
            ? `Firmware ${selected.version} and its binary were deleted.`
            : `Firmware ${selected.version} was deleted from the inventory; its binary was already absent.`
        );
      }

      await fetchFirmware();
      setFirmwareAction(null);
      window.setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setFirmwareActionError(
        err.response?.data?.error || err.message || `Failed to ${type} firmware`
      );
    } finally {
      setRunningFirmwareAction(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.bin')) {
        setSelectedFile(file);
        // Update the file input
        const fileInput = document.getElementById('firmware') as HTMLInputElement;
        if (fileInput) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
        }
      } else {
        setError('Please upload a .bin file');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleOpenRolloutModal = (fw: Firmware) => {
    setSelectedFirmware(fw);
    setShowRolloutModal(true);
    setRolloutType('devices');
    setSelectedDevices([]);
    setSelectedTenants([]);
    setRolloutPercentage(100);
    setError('');
    setSuccessMessage('');
  };

  const handleCloseRolloutModal = () => {
    setShowRolloutModal(false);
    setSelectedFirmware(null);
    setError('');
    setSuccessMessage('');
  };

  const handleRollout = async () => {
    if (!selectedFirmware) return;

    setRollingOut(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload: any = {};

      if (rolloutType === 'devices') {
        if (selectedDevices.length === 0) {
          setError('Please select at least one device');
          setRollingOut(false);
          return;
        }
        payload.device_ids = selectedDevices;
      } else if (rolloutType === 'tenants') {
        if (selectedTenants.length === 0) {
          setError('Please select at least one tenant');
          setRollingOut(false);
          return;
        }
        payload.tenant_ids = selectedTenants;
      } else if (rolloutType === 'percentage') {
        if (rolloutPercentage < 1 || rolloutPercentage > 100) {
          setError('Percentage must be between 1 and 100');
          setRollingOut(false);
          return;
        }
        payload.rollout_percentage = rolloutPercentage;
      }

      const response = await api.post(
        `/api/v1/admin/firmware/${selectedFirmware.version}/rollout`,
        payload
      );

      setSuccessMessage(
        `Firmware ${selectedFirmware.version} successfully assigned to ${response.data.assigned_devices} device(s)!`
      );
      setTimeout(() => {
        handleCloseRolloutModal();
        setSuccessMessage('');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to rollout firmware');
    } finally {
      setRollingOut(false);
    }
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
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

  const activeFirmware = firmware.find((fw) => fw.is_active);
  const latestFirmware = firmware[0];
  const totalFirmwareBytes = firmware.reduce((total, fw) => total + fw.file_size, 0);
  const averageRollout = firmware.length > 0
    ? Math.round(firmware.reduce((total, fw) => total + fw.rollout_percentage, 0) / firmware.length)
    : 0;
  const firmwareStats = [
    {
      label: 'Versions',
      value: firmware.length,
      detail: activeFirmware ? `Active v${activeFirmware.version}` : 'No active build',
      icon: PackageCheck,
      color: 'text-slate-700 dark:text-slate-200',
    },
    {
      label: 'Managed devices',
      value: devices.length,
      detail: `${tenants.length} tenants`,
      icon: Cpu,
      color: 'text-sky-600 dark:text-sky-300',
    },
    {
      label: 'Storage',
      value: `${(totalFirmwareBytes / 1024).toFixed(1)} KB`,
      detail: latestFirmware ? `Latest v${latestFirmware.version}` : 'No uploads',
      icon: HardDrive,
      color: 'text-emerald-600 dark:text-emerald-300',
    },
    {
      label: 'Avg rollout',
      value: `${averageRollout}%`,
      detail: 'Across versions',
      icon: RadioTower,
      color: 'text-amber-600 dark:text-amber-300',
    },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Firmware management</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Upload binaries, track deployed builds, and stage rollouts.
            </p>
          </div>
          {activeFirmware && (
            <div className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              v{activeFirmware.version} active
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {firmwareStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className={`mt-1 truncate text-xl font-semibold ${stat.color}`}>{stat.value}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-3 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
            <CardTitle className="text-base font-semibold tracking-normal">Upload firmware</CardTitle>
            <CardDescription>Binary package and release metadata.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleUpload} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="firmware">Firmware file</Label>
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative rounded-lg border border-dashed p-5 text-center transition-all
                    ${isDragging 
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                      : 'border-slate-300 hover:border-sky-400 dark:border-slate-700'
                    }
                    ${selectedFile ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10' : ''}
                  `}
                >
                  <input
                    type="file"
                    id="firmware"
                    name="firmware"
                    accept=".bin"
                    onChange={handleFileInputChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <FileUp className={`h-8 w-8 ${isDragging || selectedFile ? 'text-sky-600 dark:text-sky-300' : 'text-slate-400'}`} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {selectedFile ? (
                          <span className="text-sky-700 dark:text-sky-200">{selectedFile.name}</span>
                        ) : isDragging ? (
                          <span className="text-sky-700 dark:text-sky-200">Drop the file here</span>
                        ) : (
                          <>
                            <span className="text-sky-700 hover:underline dark:text-sky-200">Click to upload</span>
                            {' or drag and drop'}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedFile 
                          ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                          : 'Firmware file (.bin)'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  type="text"
                  id="version"
                  name="version"
                  required
                  placeholder="e.g., 1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  placeholder="Release notes or compatibility details"
                />
              </div>
              <Button type="submit" disabled={uploading} size="sm">
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload Firmware'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold tracking-normal">Firmware versions</CardTitle>
                <CardDescription>Build inventory and rollout controls.</CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0">{firmware.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {firmware.length === 0 ? (
              <div className="p-8 text-center">
                <PackageCheck className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">No firmware uploaded</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Upload a .bin package to begin rollout management.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {firmware.map((fw) => (
                  <div key={fw.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_140px_310px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">Version {fw.version}</p>
                          {fw.is_active && (
                            <Badge variant="default">Active</Badge>
                          )}
                      </div>
                        {fw.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{fw.description}</p>
                        )}
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {(fw.file_size / 1024).toFixed(2)} KB • Uploaded{' '}
                          {new Date(fw.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Rollout</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">{fw.rollout_percentage}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${fw.rollout_percentage}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button
                          onClick={() => handleOpenRolloutModal(fw)}
                          size="sm"
                        >
                          Rollout
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(fw)}
                          disabled={downloadingFirmwareId === fw.id}
                        >
                          <Download className="h-4 w-4" />
                          {downloadingFirmwareId === fw.id ? 'Downloading…' : 'Download'}
                        </Button>
                        {fw.is_active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFirmwareAction('unroll', fw)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Unroll
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openFirmwareAction('delete', fw)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Rollout Modal */}
        <Dialog open={showRolloutModal} onOpenChange={setShowRolloutModal}>
          {selectedFirmware && (
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Rollout Firmware {selectedFirmware.version}</DialogTitle>
                <DialogDescription>
                  Select how you want to roll out this firmware version to devices.
                </DialogDescription>
              </DialogHeader>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {successMessage && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Rollout Type</Label>
                  <RadioGroup
                    value={rolloutType}
                    onValueChange={(value) => setRolloutType(value as 'devices' | 'tenants' | 'percentage')}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="devices" id="devices" />
                      <Label htmlFor="devices" className="font-normal cursor-pointer">
                        Select Specific Devices
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="tenants" id="tenants" />
                      <Label htmlFor="tenants" className="font-normal cursor-pointer">
                        All Devices in Selected Tenants
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentage" id="percentage" />
                      <Label htmlFor="percentage" className="font-normal cursor-pointer">
                        Percentage of All Devices
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {rolloutType === 'devices' && (
                  <div className="space-y-2">
                    <Label>Select Devices ({selectedDevices.length} selected)</Label>
                    <Card className="max-h-64 overflow-y-auto">
                      <CardContent className="pt-6">
                        {devices.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">No devices found</p>
                        ) : (
                          <div className="space-y-3">
                            {devices.map((device) => (
                              <div key={device.device_id} className="flex items-start space-x-3 p-2 hover:bg-accent rounded-md">
                                <Checkbox
                                  id={`device-${device.device_id}`}
                                  checked={selectedDevices.includes(device.device_id)}
                                  onCheckedChange={() => toggleDeviceSelection(device.device_id)}
                                />
                                <label
                                  htmlFor={`device-${device.device_id}`}
                                  className="flex-1 cursor-pointer"
                                >
                                  <div className="text-sm font-medium">
                                    {device.name || device.device_id}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {device.device_id} • {device.tenant_name} • v{device.firmware_version || 'N/A'}
                                  </div>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {rolloutType === 'tenants' && (
                  <div className="space-y-2">
                    <Label>Select Tenants ({selectedTenants.length} selected)</Label>
                    <Card className="max-h-64 overflow-y-auto">
                      <CardContent className="pt-6">
                        {tenants.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">No tenants found</p>
                        ) : (
                          <div className="space-y-3">
                            {tenants.map((tenant) => (
                              <div key={tenant.id} className="flex items-center space-x-3 p-2 hover:bg-accent rounded-md">
                                <Checkbox
                                  id={`tenant-${tenant.id}`}
                                  checked={selectedTenants.includes(tenant.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedTenants([...selectedTenants, tenant.id]);
                                    } else {
                                      setSelectedTenants(selectedTenants.filter((id) => id !== tenant.id));
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`tenant-${tenant.id}`}
                                  className="text-sm font-medium cursor-pointer flex-1"
                                >
                                  {tenant.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {rolloutType === 'percentage' && (
                  <div className="space-y-2">
                    <Label>Rollout Percentage</Label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={rolloutPercentage}
                        onChange={(e) => setRolloutPercentage(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={rolloutPercentage}
                        onChange={(e) => setRolloutPercentage(parseInt(e.target.value) || 1)}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will randomly select {rolloutPercentage}% of all devices
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseRolloutModal}
                  disabled={rollingOut}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRollout}
                  disabled={rollingOut}
                >
                  {rollingOut ? 'Rolling out...' : 'Rollout Firmware'}
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>

        {/* Unroll / delete confirmation */}
        <Dialog
          open={firmwareAction !== null}
          onOpenChange={(open) => {
            if (!open) closeFirmwareAction();
          }}
        >
          {firmwareAction && (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {firmwareAction.type === 'unroll' ? 'Unroll' : 'Delete'} firmware {firmwareAction.firmware.version}?
                </DialogTitle>
                <DialogDescription>
                  {firmwareAction.type === 'unroll'
                    ? 'This stops offering the release and cancels pending, downloading, and installing assignments. A device that is already writing firmware cannot be interrupted.'
                    : 'This permanently deletes the withdrawn release metadata and its managed .bin file. This action cannot be undone.'}
                </DialogDescription>
              </DialogHeader>

              {firmwareActionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Action failed</AlertTitle>
                  <AlertDescription>{firmwareActionError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeFirmwareAction}
                  disabled={runningFirmwareAction}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={firmwareAction.type === 'delete' ? 'destructive' : 'default'}
                  onClick={handleFirmwareAction}
                  disabled={runningFirmwareAction}
                >
                  {runningFirmwareAction
                    ? firmwareAction.type === 'unroll' ? 'Unrolling…' : 'Deleting…'
                    : firmwareAction.type === 'unroll' ? 'Unroll firmware' : 'Delete firmware'}
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>
    </Layout>
  );
}
