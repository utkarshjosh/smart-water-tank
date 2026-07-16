import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { status, isAdmin } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/login', { replace: true });
    } else if (status === 'authenticated' && !isAdmin) {
      // Admin shell is role-gated: non-admin users go to the tenant app.
      navigate('/app/devices', { replace: true });
    }
  }, [status, isAdmin, navigate]);

  if (status === 'initializing') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background relative overflow-hidden">
        {/* Background Gradients - Aquatic Theme */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
        </div>

        {/* Loading Content */}
        <div className="relative z-10 flex flex-col items-center justify-center space-y-6">
          {/* Logo with Circular Loader */}
          <div className="relative w-24 h-24">
            {/* Circular Spinner around Logo */}
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
            {/* Logo Image */}
            <div className="absolute inset-2 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="AquaMind Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          {/* Loading Text */}
          <div className="flex flex-col items-center space-y-2">
            <p className="text-lg font-semibold text-foreground">Loading AquaMind</p>
            <p className="text-sm text-muted-foreground">Initializing your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated' || !isAdmin) {
    return null;
  }

  return (
    <div className="h-full relative">
      <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900">
        <Sidebar />
      </div>
      <main className="md:pl-72 min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header />
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
