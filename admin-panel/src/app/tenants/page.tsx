'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  created_at: string;
  device_count: number;
  user_count: number;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await api.get('/api/v1/admin/tenants');
      setTenants(response.data.tenants);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tenants');
    } finally {
      setLoading(false);
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
        <h1 className="text-3xl font-bold mb-6">Tenants</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {tenants.map((tenant) => (
              <li key={tenant.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-medium text-gray-900">{tenant.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Created {new Date(tenant.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-900">
                      {tenant.device_count} devices
                    </div>
                    <div className="text-sm text-gray-500">
                      {tenant.user_count} users
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


