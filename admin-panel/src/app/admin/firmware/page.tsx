'use client';

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
import { AlertCircle, CheckCircle2, Download, Upload, FileUp } from 'lucide-react';
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

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold mb-6">Firmware Management</h1>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Firmware</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firmware">Firmware File</Label>
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative border-2 border-dashed rounded-lg p-8 text-center transition-all
                    ${isDragging 
                      ? 'border-primary bg-primary/10 scale-[1.02]' 
                      : 'border-muted-foreground/25 hover:border-primary/50'
                    }
                    ${selectedFile ? 'border-primary bg-primary/5' : ''}
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
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <FileUp className={`h-10 w-10 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {selectedFile ? (
                          <span className="text-primary">{selectedFile.name}</span>
                        ) : isDragging ? (
                          <span className="text-primary">Drop the file here</span>
                        ) : (
                          <>
                            <span className="text-primary hover:underline">Click to upload</span>
                            {' or drag and drop'}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                />
              </div>
              <Button type="submit" disabled={uploading}>
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload Firmware'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Firmware Versions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {firmware.map((fw) => (
                <Card key={fw.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>Version {fw.version}</CardTitle>
                          {fw.is_active && (
                            <Badge variant="default">Active</Badge>
                          )}
                        </div>
                        {fw.description && (
                          <CardDescription className="mt-1">{fw.description}</CardDescription>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          {(fw.file_size / 1024).toFixed(2)} KB • Uploaded{' '}
                          {new Date(fw.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {fw.rollout_percentage > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {fw.rollout_percentage}% rolled out
                          </span>
                        )}
                        <Button
                          onClick={() => handleOpenRolloutModal(fw)}
                          size="sm"
                        >
                          Rollout
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/firmware/${fw.id}/download`}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

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
      </div>
    </Layout>
  );
}





