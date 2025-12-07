'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle } from 'lucide-react';

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

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tenants' | 'users')}>
          <TabsList>
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          {/* Tenants Tab */}
          <TabsContent value="tenants">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">Tenants</h2>
              <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                {showCreateForm ? 'Cancel' : '+ Create Tenant'}
              </Button>
            </div>

            {(error || usersError) && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error || usersError}</AlertDescription>
              </Alert>
            )}

            {showCreateForm && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Create New Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateTenant} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tenant-name">Tenant Name</Label>
                      <Input
                        id="tenant-name"
                        type="text"
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                        placeholder="Enter tenant name"
                        disabled={creating}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={creating || !newTenantName.trim()}
                      >
                        {creating ? 'Creating...' : 'Create'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewTenantName('');
                          setError('');
                        }}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="flex h-full items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {tenants.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-center text-muted-foreground">
                        No tenants found. Create your first tenant above.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  tenants.map((tenant) => (
                    <Card key={tenant.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{tenant.name}</CardTitle>
                            <CardDescription>
                              Created {new Date(tenant.created_at).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="font-medium">{tenant.device_count} devices</div>
                            <div className="text-sm text-muted-foreground">{tenant.user_count} users</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">User Management</h2>
              <Button
                variant="default"
                onClick={() => {
                  setShowFirebaseSearch(!showFirebaseSearch);
                  if (!showFirebaseSearch) {
                    searchFirebaseUsers();
                  }
                }}
              >
                {showFirebaseSearch ? 'Hide' : 'Search'} Firebase Users
              </Button>
            </div>

            {/* Firebase Users Search */}
            {showFirebaseSearch && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Search Firebase Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-4">
                    <Input
                      type="text"
                      value={firebaseSearch}
                      onChange={(e) => setFirebaseSearch(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          searchFirebaseUsers();
                        }
                      }}
                      placeholder="Search by email, name, or UID..."
                      className="flex-1"
                    />
                    <Button
                      onClick={searchFirebaseUsers}
                      disabled={usersLoading}
                    >
                      {usersLoading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>

                  {firebaseUsers.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Firebase Users ({firebaseUsers.length})</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {firebaseUsers.map((user) => (
                          <Card key={user.uid}>
                            <CardContent className="pt-6">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-medium">{user.email || user.uid}</div>
                                  {user.displayName && (
                                    <div className="text-sm text-muted-foreground">{user.displayName}</div>
                                  )}
                                  <div className="text-xs text-muted-foreground mt-1">UID: {user.uid}</div>
                                  {user.is_linked && user.tenant_name && (
                                    <Badge variant="default" className="mt-1">
                                      ✓ Linked to: {user.tenant_name}
                                    </Badge>
                                  )}
                                </div>
                                {!user.is_linked && (
                                  <div className="ml-4 flex gap-2">
                                    <Select
                                      value={selectedTenantForUser[user.uid] || ''}
                                      onValueChange={(value) =>
                                        setSelectedTenantForUser((prev) => ({
                                          ...prev,
                                          [user.uid]: value,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Select tenant..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {tenants.map((tenant) => (
                                          <SelectItem key={tenant.id} value={tenant.id}>
                                            {tenant.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
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
                                      size="sm"
                                    >
                                      {linkingUser === user.uid ? 'Linking...' : 'Link to Tenant'}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Database Users List */}
            <Card>
              <CardHeader>
                <CardTitle>Users in Database</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex h-full items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : databaseUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No users found in database. Search Firebase users above to link them to tenants.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {databaseUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.name || '-'}</TableCell>
                            <TableCell>
                              {user.tenant_name || (
                                <span className="text-destructive">Not assigned</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{user.role}</Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={user.tenant_id || ''}
                                onValueChange={(value) => {
                                  if (value) {
                                    handleUpdateUserTenant(user.id, value);
                                  }
                                }}
                                disabled={linkingUser === user.id}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="Change tenant..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {tenants.map((tenant) => (
                                    <SelectItem key={tenant.id} value={tenant.id}>
                                      {tenant.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}






