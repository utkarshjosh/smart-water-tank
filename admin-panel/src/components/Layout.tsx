'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signOut, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getAuthToken, setAuthToken, removeAuthToken } from '@/lib/cookies';
import Link from 'next/link';

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, loading] = useAuthState(auth);

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

  const handleLogout = async () => {
    await signOut(auth);
    removeAuthToken();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold">Water Tank Admin</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/admin/dashboard"
                  className={`${
                    pathname === '/admin/dashboard'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/devices"
                  className={`${
                    pathname?.startsWith('/admin/devices')
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Devices
                </Link>
                <Link
                  href="/admin/firmware"
                  className={`${
                    pathname === '/admin/firmware'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Firmware
                </Link>
                <Link
                  href="/admin/analytics"
                  className={`${
                    pathname === '/admin/analytics'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Analytics
                </Link>
                <Link
                  href="/admin/tenants"
                  className={`${
                    pathname === '/admin/tenants'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Tenants
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">{user.email}</span>
              <button
                onClick={handleLogout}
                className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}


