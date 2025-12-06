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

interface DatabaseUser {
  id: string;
  firebase_uid: string;
  email: string;
  name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  role: string;
  created_at: string;
}

interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  disabled: boolean;
  metadata: {
    creationTime: string;
    lastSignInTime: string | null;
  };
  tenant_id: string | null;
  tenant_name: string | null;
  is_linked: boolean;
}

export default function TenantsPage() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'users'>('tenants');
  
  // Tenants state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Users state
  const [databaseUsers, setDatabaseUsers] = useState<DatabaseUser[]>([]);
  const [firebaseUsers, setFirebaseUsers] = useState<FirebaseUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [firebaseSearch, setFirebaseSearch] = useState('');
  const [showFirebaseSearch, setShowFirebaseSearch] = useState(false);
  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [selectedTenantForUser, setSelectedTenantForUser] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchDatabaseUsers();
    }
  }, [activeTab]);

  const fetchTenants = async () => {
    try {
      setError('');
      setLoading(true);
      const response = await api.get('/api/v1/admin/tenants');
      setTenants(response.data.tenants);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabaseUsers = async () => {
    try {
      setUsersError('');
      setUsersLoading(true);
      const response = await api.get('/api/v1/admin/users');
      setDatabaseUsers(response.data.users);
    } catch (err: any) {
      setUsersError(err.response?.data?.error || err.message || 'Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  };

  const searchFirebaseUsers = async () => {
    try {
      setUsersError('');
      setUsersLoading(true);
      const params = new URLSearchParams();
      if (firebaseSearch.trim()) {
        params.append('search', firebaseSearch.trim());
      }
      params.append('limit', '50');
      
      const response = await api.get(`/api/v1/admin/users/firebase?${params.toString()}`);
      setFirebaseUsers(response.data.users);
    } catch (err: any) {
      setUsersError(err.response?.data?.error || err.message || 'Failed to search Firebase users');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleLinkUserToTenant = async (firebaseUid: string, email: string, displayName: string | null) => {
    const tenantId = selectedTenantForUser[firebaseUid];
    if (!tenantId) {
      setUsersError('Please select a tenant');
      return;
    }

    setLinkingUser(firebaseUid);
    setUsersError('');

    try {
      await api.post('/api/v1/admin/users', {
        firebase_uid: firebaseUid,
        email: email,
        name: displayName || null,
        tenant_id: tenantId,
        role: 'user',
      });

      // Refresh both lists
      await fetchDatabaseUsers();
      await searchFirebaseUsers();
      
      // Clear selection
      setSelectedTenantForUser((prev) => {
        const next = { ...prev };
        delete next[firebaseUid];
        return next;
      });
    } catch (err: any) {
      setUsersError(err.response?.data?.error || err.message || 'Failed to link user to tenant');
    } finally {
      setLinkingUser(null);
    }
  };

  const handleUpdateUserTenant = async (userId: string, tenantId: string) => {
    setLinkingUser(userId);
    setUsersError('');

    try {
      await api.put(`/api/v1/admin/users/${userId}/tenant`, {
        tenant_id: tenantId,
      });

      await fetchDatabaseUsers();
    } catch (err: any) {
      setUsersError(err.response?.data?.error || err.message || 'Failed to update user tenant');
    } finally {
      setLinkingUser(null);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTenantName.trim()) {
      setError('Tenant name is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const response = await api.post('/api/v1/admin/tenants', {
        name: newTenantName.trim(),
      });
      
      // Refresh tenants list
      await fetchTenants();
      
      // Reset form
      setNewTenantName('');
      setShowCreateForm(false);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Manage Tenants & Users</h1>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('tenants')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tenants'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Tenants
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Users
            </button>
          </nav>
        </div>

        {/* Tenants Tab */}
        {activeTab === 'tenants' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">Tenants</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {showCreateForm ? 'Cancel' : '+ Create Tenant'}
              </button>
            </div>

            {(error || usersError) && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error || usersError}
              </div>
            )}

            {showCreateForm && (
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h3 className="text-xl font-semibold mb-4">Create New Tenant</h3>
                <form onSubmit={handleCreateTenant}>
                  <div className="mb-4">
                    <label htmlFor="tenant-name" className="block text-sm font-medium text-gray-700 mb-2">
                      Tenant Name
                    </label>
                    <input
                      id="tenant-name"
                      type="text"
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter tenant name"
                      disabled={creating}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={creating || !newTenantName.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewTenantName('');
                        setError('');
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      disabled={creating}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">Loading tenants...</div>
            ) : (
              <div className="bg-white shadow rounded-lg overflow-hidden">
                {tenants.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No tenants found. Create your first tenant above.
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">User Management</h2>
              <button
                onClick={() => {
                  setShowFirebaseSearch(!showFirebaseSearch);
                  if (!showFirebaseSearch) {
                    searchFirebaseUsers();
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                {showFirebaseSearch ? 'Hide' : 'Search'} Firebase Users
              </button>
            </div>

            {/* Firebase Users Search */}
            {showFirebaseSearch && (
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h3 className="text-xl font-semibold mb-4">Search Firebase Users</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={firebaseSearch}
                    onChange={(e) => setFirebaseSearch(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        searchFirebaseUsers();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Search by email, name, or UID..."
                  />
                  <button
                    onClick={searchFirebaseUsers}
                    disabled={usersLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {usersLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {firebaseUsers.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Firebase Users ({firebaseUsers.length})</h4>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {firebaseUsers.map((user) => (
                        <div key={user.uid} className="border border-gray-200 rounded p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium">{user.email || user.uid}</div>
                              {user.displayName && (
                                <div className="text-sm text-gray-500">{user.displayName}</div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">UID: {user.uid}</div>
                              {user.is_linked && user.tenant_name && (
                                <div className="text-sm text-green-600 mt-1">
                                  ✓ Linked to: {user.tenant_name}
                                </div>
                              )}
                            </div>
                            {!user.is_linked && (
                              <div className="ml-4">
                                <select
                                  value={selectedTenantForUser[user.uid] || ''}
                                  onChange={(e) =>
                                    setSelectedTenantForUser((prev) => ({
                                      ...prev,
                                      [user.uid]: e.target.value,
                                    }))
                                  }
                                  className="px-3 py-1 border border-gray-300 rounded text-sm mr-2"
                                >
                                  <option value="">Select tenant...</option>
                                  {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                      {tenant.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() =>
                                    handleLinkUserToTenant(
                                      user.uid,
                                      user.email || '',
                                      user.displayName
                                    )
                                  }
                                  disabled={
                                    !selectedTenantForUser[user.uid] ||
                                    linkingUser === user.uid
                                  }
                                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  {linkingUser === user.uid ? 'Linking...' : 'Link to Tenant'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Database Users List */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Users in Database</h3>
              </div>
              {usersLoading ? (
                <div className="text-center py-8">Loading users...</div>
              ) : databaseUsers.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No users found in database. Search Firebase users above to link them to tenants.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tenant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {databaseUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.name || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.tenant_name || (
                              <span className="text-red-500">Not assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <select
                              value={user.tenant_id || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleUpdateUserTenant(user.id, e.target.value);
                                }
                              }}
                              disabled={linkingUser === user.id}
                              className="px-3 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="">Change tenant...</option>
                              {tenants.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                  {tenant.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}




