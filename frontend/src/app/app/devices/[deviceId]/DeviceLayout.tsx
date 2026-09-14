import './device.css';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal } from '@phosphor-icons/react';
import { ShellAction, usePageHeading } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusDot } from '@/components/ui/status-dot';
import { Skeleton } from '@/components/ui/skeleton';
import { TankSetupWizard } from '@/components/tank-setup/TankSetupWizard';
import { cn } from '@/lib/utils';
import { useDevice, useTankProfile } from './useDevice';

const TABS = [
  { to: '.', label: 'Overview', end: true },
  { to: 'history', label: 'History' },
  { to: 'alerts', label: 'Alerts' },
  { to: 'settings', label: 'Settings' },
];

/**
 * Frame for the four device routes. The old single page stacked six cards into
 * roughly three phone screens with the chart buried in the middle; each tab is
 * now one screenful, deep-linkable, and restored by the browser's back button.
 */
export default function DeviceLayout() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [editingTank, setEditingTank] = useState(false);

  const device = useDevice(deviceId);
  const profile = useTankProfile(deviceId);

  const lastSeen = device.data?.last_seen
    ? new Date(device.data.last_seen).toLocaleString()
    : 'Never';

  usePageHeading(device.data?.name, device.data ? `Last seen ${lastSeen}` : undefined);

  return (
    <div className="device-page space-y-4">
      <ShellAction>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditingTank(true)}
          aria-label="Edit tank setup"
        >
          <SlidersHorizontal size={20} />
        </Button>
      </ShellAction>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate('/app/devices')}
        >
          <ArrowLeft size={16} />
          All tanks
        </Button>
        {device.data && (
          <StatusDot
            status={device.data.status === 'online' ? 'online' : 'offline'}
            label={device.data.status === 'online' ? 'Online' : 'Offline'}
          />
        )}
      </div>

      <nav
        className="device-tabs -mx-4 flex gap-0.5 overflow-x-auto border-b border-hairline px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Device sections"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'relative shrink-0 px-3 py-2.5 text-label transition-colors duration-instant ease-out',
                isActive
                  ? 'text-ink-1 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand'
                  : 'text-ink-3 hover:text-ink-1'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="animate-fade-rise">
        <Suspense fallback={<TabSkeleton />}>
          <Outlet />
        </Suspense>
      </div>

      <Sheet open={editingTank} onOpenChange={setEditingTank}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-4">
            <SheetTitle>Tank setup</SheetTitle>
          </SheetHeader>
          {deviceId && (
            <TankSetupWizard
              deviceId={deviceId}
              initialData={profile.data ?? null}
              onComplete={() => {
                setEditingTank(false);
                profile.refetch();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Placeholder for a tab whose chunk is still loading. The header, the back link
 * and the tab strip above it stay put - switching tabs should move the content,
 * not redraw the screen.
 */
function TabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
