import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuthSession } from '@/lib/useAuthSession';
import { TenantSidebar } from '@/components/layout/tenant-sidebar';
import { TenantHeader } from '@/components/layout/tenant-header';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, loading } = useAuthSession();
  const [isMounted, setIsMounted] = useState(false);
  const [tenantName, setTenantName] = useState<string | undefined>();
  const hasInitialAuthCheck = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && isMounted) {
      hasInitialAuthCheck.current = true;
    }
  }, [loading, isMounted]);

  useEffect(() => {
    if (!loading && isMounted && !user) {
      navigate('/login', { replace: true });
    }
  }, [isMounted, loading, navigate, user]);

  useEffect(() => {
    if (!user) return;
    api.get('/api/v1/user/me')
      .then(({ data }) => setTenantName(data.tenant_name))
      .catch((error) => console.error('Error fetching current user:', error));
  }, [user]);

  if ((loading || !isMounted) && !hasInitialAuthCheck.current) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center space-y-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
            <div className="absolute inset-2 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="AquaMind Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <p className="text-lg font-semibold text-foreground">Loading AquaMind</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-full relative">
      <div className="hidden h-full md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 z-[80] bg-slate-950">
        <TenantSidebar />
      </div>
      <main className="md:pl-60 min-h-screen bg-slate-50 dark:bg-slate-950">
        <TenantHeader tenantName={tenantName} />
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          {children}
        </div>
      </main>
    </div>
  );
}
