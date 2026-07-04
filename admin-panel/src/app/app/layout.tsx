import TenantLayout from '@/components/TenantLayout';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayout>{children}</TenantLayout>;
}
