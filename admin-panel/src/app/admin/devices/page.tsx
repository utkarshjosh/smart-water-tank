'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import api from '@/lib/api';

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
        <div className="text-center">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Devices</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Create Device
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Create Device Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Device</h3>
                <form onSubmit={handleCreateDevice}>
                  <div className="mb-4">
                    <label htmlFor="device_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Device ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="device_id"
                      value={formData.device_id}
                      onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="tenant_id" className="block text-sm font-medium text-gray-700 mb-1">
                      Tenant <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="tenant_id"
                      value={formData.tenant_id}
                      onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Select a tenant</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Name (optional)
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {formError && (
                    <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                      {formError}
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setFormError('');
                        setFormData({ device_id: '', tenant_id: '', name: '' });
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm font-medium"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                      disabled={submitting}
                    >
                      {submitting ? 'Creating...' : 'Create Device'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Token Display Modal */}
        {showTokenModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Device Created Successfully</h3>
                <div className="mb-4">
                  <p className="text-sm text-red-600 font-medium mb-2">
                    ⚠️ Important: Save this token now. It will not be shown again!
                  </p>
                  <div className="bg-gray-100 border border-gray-300 rounded-md p-3 mb-2">
                    <textarea
                      readOnly
                      value={createdToken}
                      className="w-full bg-transparent border-none resize-none focus:outline-none text-sm font-mono"
                      rows={4}
                    />
                  </div>
                  <button
                    onClick={copyToken}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
                  >
                    Copy Token
                  </button>
                </div>
                <button
                  onClick={closeTokenModal}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {devices.map((device) => (
              <li key={device.id}>
                <div
                  className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/admin/devices/${device.device_id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            device.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {device.name || device.device_id}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.device_id} • {device.tenant_name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-900">
                        {device.current_volume !== null && device.current_volume !== undefined
                          ? `${Number(device.current_volume).toFixed(1)}L`
                          : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {device.status} • v{device.firmware_version || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Layout>
  );
}




