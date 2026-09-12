import {
  ChartLine,
  Cpu,
  Buildings,
  FileCode,
  Gauge,
  Plus,
  Drop,
  type Icon,
} from '@phosphor-icons/react';

export interface NavItem {
  label: string;
  /** Shorter label for the mobile tab bar, where 56px is all there is. */
  short?: string;
  href: string;
  icon: Icon;
  /** Hidden from the mobile tab bar - reachable, just not a primary tab. */
  desktopOnly?: boolean;
}

export const TENANT_NAV: NavItem[] = [
  { label: 'My tanks', short: 'Tanks', href: '/app/devices', icon: Drop },
  { label: 'Add device', short: 'Add', href: '/app/onboarding', icon: Plus },
];

export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', short: 'Home', href: '/admin/dashboard', icon: Gauge },
  { label: 'Devices', href: '/admin/devices', icon: Cpu },
  { label: 'Analytics', short: 'Stats', href: '/admin/analytics', icon: ChartLine },
  { label: 'Firmware', href: '/admin/firmware', icon: FileCode },
  { label: 'Tenants', href: '/admin/tenants', icon: Buildings },
];

export type ShellVariant = 'tenant' | 'admin';

export const navFor = (variant: ShellVariant) => (variant === 'admin' ? ADMIN_NAV : TENANT_NAV);
