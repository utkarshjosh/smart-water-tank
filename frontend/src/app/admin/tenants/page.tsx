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
import { AlertCircle, Building2, Plus, Search, UserPlus, Users } from 'lucide-react';

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

  const totalDevices = tenants.reduce((sum, tenant) => sum + tenant.device_count, 0);
  const totalTenantUsers = tenants.reduce((sum, tenant) => sum + tenant.user_count, 0);
  const unassignedUsers = databaseUsers.filter((user) => !user.tenant_id).length;
  const linkedFirebaseUsers = firebaseUsers.filter((user) => user.is_linked).length;

  return (
    <Layout>
      <div className="space-y-5 px-4 py-4 sm:px-0">
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Admin directory
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tenants & users</h1>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[430px]">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">Tenants</div>
              <div className="text-lg font-semibold">{tenants.length}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">Devices</div>
              <div className="text-lg font-semibold">{totalDevices}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">Users</div>
              <div className="text-lg font-semibold">{activeTab === 'users' ? databaseUsers.length : totalTenantUsers}</div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tenants' | 'users')} className="space-y-4">
          <TabsList className="h-9 rounded-md">
            <TabsTrigger value="tenants" className="h-7 gap-2 px-3 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Tenants
            </TabsTrigger>
            <TabsTrigger value="users" className="h-7 gap-2 px-3 text-xs">
              <Users className="h-3.5 w-3.5" />
              Users
            </TabsTrigger>
          </TabsList>

          {/* Tenants Tab */}
          <TabsContent value="tenants" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Tenant roster</h2>
                <p className="text-sm text-muted-foreground">
                  {tenants.length} tenant{tenants.length === 1 ? '' : 's'} across {totalDevices} device{totalDevices === 1 ? '' : 's'}
                </p>
              </div>
              <Button onClick={() => setShowCreateForm(!showCreateForm)} size="sm" variant={showCreateForm ? 'outline' : 'default'}>
                {showCreateForm ? (
                  'Cancel'
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create tenant
                  </>
                )}
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
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Create tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateTenant} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-1.5">
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
                        size="sm"
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
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border">
                <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {tenants.length === 0 ? (
                  <Card>
                    <CardContent className="py-8">
                      <p className="text-center text-muted-foreground">
                        No tenants found. Create your first tenant above.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  tenants.map((tenant) => (
                    <Card key={tenant.id} className="rounded-md">
                      <CardContent className="p-4">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0">
                            <CardTitle className="truncate text-sm font-semibold">{tenant.name}</CardTitle>
                            <CardDescription className="mt-1 text-xs">
                              Created {new Date(tenant.created_at).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:w-44">
                            <div className="rounded-md bg-muted/50 px-3 py-2 text-right">
                              <div className="text-sm font-semibold">{tenant.device_count}</div>
                              <div className="text-[11px] uppercase text-muted-foreground">Devices</div>
                            </div>
                            <div className="rounded-md bg-muted/50 px-3 py-2 text-right">
                              <div className="text-sm font-semibold">{tenant.user_count}</div>
                              <div className="text-[11px] uppercase text-muted-foreground">Users</div>
                            </div>
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
          <TabsContent value="users" className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-base font-semibold">User assignments</h2>
                <p className="text-sm text-muted-foreground">
                  {databaseUsers.length} database user{databaseUsers.length === 1 ? '' : 's'} · {unassignedUsers} unassigned · {linkedFirebaseUsers} Firebase linked
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setShowFirebaseSearch(!showFirebaseSearch);
                  if (!showFirebaseSearch) {
                    searchFirebaseUsers();
                  }
                }}
              >
                {showFirebaseSearch ? (
                  'Hide search'
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search Firebase
                  </>
                )}
              </Button>
            </div>

            {/* Firebase Users Search */}
            {showFirebaseSearch && (
              <Card className="rounded-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Firebase users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex gap-2">
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
                      size="sm"
                    >
                      {usersLoading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>

                  {firebaseUsers.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-medium">Firebase users ({firebaseUsers.length})</h4>
                      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                        {firebaseUsers.map((user) => (
                          <Card key={user.uid} className="rounded-md">
                            <CardContent className="p-3">
                              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{user.email || user.uid}</div>
                                  {user.displayName && (
                                    <div className="text-sm text-muted-foreground">{user.displayName}</div>
                                  )}
                                  <div className="mt-1 truncate text-xs text-muted-foreground">UID: {user.uid}</div>
                                  {user.is_linked && user.tenant_name && (
                                    <Badge variant="default" className="mt-2">
                                      Linked to {user.tenant_name}
                                    </Badge>
                                  )}
                                </div>
                                {!user.is_linked && (
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Select
                                      value={selectedTenantForUser[user.uid] || ''}
                                      onValueChange={(value) =>
                                        setSelectedTenantForUser((prev) => ({
                                          ...prev,
                                          [user.uid]: value,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="h-9 w-full sm:w-[180px]">
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
                                      {linkingUser === user.uid ? (
                                        'Linking...'
                                      ) : (
                                        <>
                                          <UserPlus className="mr-2 h-4 w-4" />
                                          Link
                                        </>
                                      )}
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
            <Card className="rounded-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Database users</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex h-36 items-center justify-center">
                    <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary"></div>
                  </div>
                ) : databaseUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No users found in database. Search Firebase users above to link them to tenants.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-9">Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {databaseUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="max-w-[260px] truncate py-2 font-medium">{user.email}</TableCell>
                            <TableCell className="py-2">{user.name || '-'}</TableCell>
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
                                <SelectTrigger className="h-9 w-[180px]">
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





