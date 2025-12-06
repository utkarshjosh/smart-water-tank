'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';

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
    const file = (formData.get('firmware') as File) || null;
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
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to upload firmware');
    } finally {
      setUploading(false);
    }
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
        <div className="text-center">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold mb-6">Firmware Management</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Firmware</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Firmware File
              </label>
              <input
                type="file"
                name="firmware"
                accept=".bin"
                required
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version
              </label>
              <input
                type="text"
                name="version"
                required
                placeholder="e.g., 1.0.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                name="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Firmware'}
            </button>
          </form>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <h2 className="text-xl font-semibold p-6 border-b">Firmware Versions</h2>
          <ul className="divide-y divide-gray-200">
            {firmware.map((fw) => (
              <li key={fw.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-medium text-gray-900">
                      Version {fw.version}
                      {fw.is_active && (
                        <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                    </div>
                    {fw.description && (
                      <p className="text-sm text-gray-500 mt-1">{fw.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      {(fw.file_size / 1024).toFixed(2)} KB • Uploaded{' '}
                      {new Date(fw.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {fw.rollout_percentage > 0 && (
                      <span className="text-xs text-gray-500">
                        {fw.rollout_percentage}% rolled out
                      </span>
                    )}
                    <button
                      onClick={() => handleOpenRolloutModal(fw)}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Rollout
                    </button>
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/firmware/${fw.id}/download`}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Download
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Rollout Modal */}
        {showRolloutModal && selectedFirmware && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Rollout Firmware {selectedFirmware.version}
                  </h3>
                  <button
                    onClick={handleCloseRolloutModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>

                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                    {successMessage}
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rollout Type
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="devices"
                        checked={rolloutType === 'devices'}
                        onChange={(e) => setRolloutType(e.target.value as any)}
                        className="mr-2"
                      />
                      <span>Select Specific Devices</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="tenants"
                        checked={rolloutType === 'tenants'}
                        onChange={(e) => setRolloutType(e.target.value as any)}
                        className="mr-2"
                      />
                      <span>All Devices in Selected Tenants</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="percentage"
                        checked={rolloutType === 'percentage'}
                        onChange={(e) => setRolloutType(e.target.value as any)}
                        className="mr-2"
                      />
                      <span>Percentage of All Devices</span>
                    </label>
                  </div>
                </div>

                {rolloutType === 'devices' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Devices ({selectedDevices.length} selected)
                    </label>
                    <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                      {devices.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No devices found</div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          {devices.map((device) => (
                            <li key={device.device_id} className="p-3 hover:bg-gray-50">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedDevices.includes(device.device_id)}
                                  onChange={() => toggleDeviceSelection(device.device_id)}
                                  className="mr-3"
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    {device.name || device.device_id}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {device.device_id} • {device.tenant_name} • v{device.firmware_version || 'N/A'}
                                  </div>
                                </div>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {rolloutType === 'tenants' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Tenants ({selectedTenants.length} selected)
                    </label>
                    <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                      {tenants.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No tenants found</div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          {tenants.map((tenant) => (
                            <li key={tenant.id} className="p-3 hover:bg-gray-50">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedTenants.includes(tenant.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTenants([...selectedTenants, tenant.id]);
                                    } else {
                                      setSelectedTenants(selectedTenants.filter((id) => id !== tenant.id));
                                    }
                                  }}
                                  className="mr-3"
                                />
                                <span className="text-sm font-medium text-gray-900">{tenant.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {rolloutType === 'percentage' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rollout Percentage
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={rolloutPercentage}
                        onChange={(e) => setRolloutPercentage(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={rolloutPercentage}
                        onChange={(e) => setRolloutPercentage(parseInt(e.target.value) || 1)}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      This will randomly select {rolloutPercentage}% of all devices
                    </p>
                  </div>
                )}

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseRolloutModal}
                    disabled={rollingOut}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRollout}
                    disabled={rollingOut}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {rollingOut ? 'Rolling out...' : 'Rollout Firmware'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}





