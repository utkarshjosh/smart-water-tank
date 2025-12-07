'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAuthState } from 'react-firebase-hooks/auth';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setAuthToken, removeAuthToken } from '@/lib/cookies';
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, loading] = useAuthState(auth);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync Firebase auth state with cookies
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in, update cookie with fresh token
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
        } catch (error) {
          console.error('Error getting token:', error);
        }
      } else {
        // User is signed out, remove cookie
        removeAuthToken();
      }
    });

    // Listen for token refresh events and update cookie
    const unsubscribeToken = onIdTokenChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
        } catch (error) {
          console.error('Error refreshing token:', error);
        }
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeToken();
    };
  }, []);

  if (loading || !isMounted) {
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
              <Image
                src="/logo.png"
                alt="AquaMind Logo"
                fill
                className="object-contain"
                priority
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

  if (!user) {
    router.push('/login');
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


