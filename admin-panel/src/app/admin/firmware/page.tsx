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

export default function FirmwarePage() {
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFirmware();
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

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError('');

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

      fetchFirmware();
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      setError(err.message || 'Failed to upload firmware');
    } finally {
      setUploading(false);
    }
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
                  <div className="text-right">
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
      </div>
    </Layout>
  );
}

