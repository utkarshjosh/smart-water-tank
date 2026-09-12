import { useState } from 'react';
import { AppShell } from '@/components/shell';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TenantsTab } from './TenantsTab';
import { UsersTab } from './UsersTab';

type Tab = 'tenants' | 'users';

/**
 * Was a single 652-line file holding tenant CRUD, the database-user list and
 * the Firebase linking flow in one component with fourteen pieces of local
 * state. Split into two tabs, each owning its own queries.
 */
export default function TenantsPage() {
  const [tab, setTab] = useState<Tab>('tenants');

  return (
    <AppShell variant="admin" title="Tenants">
      <div className="space-y-4">
        <PageHeader
          title="Tenants & users"
          description="Organisations that own devices, and the accounts attached to them."
        />

        <SegmentedControl
          aria-label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tenants', label: 'Tenants' },
            { value: 'users', label: 'Users' },
          ]}
        />

        <div className="animate-fade-rise">{tab === 'tenants' ? <TenantsTab /> : <UsersTab />}</div>
      </div>
    </AppShell>
  );
}
