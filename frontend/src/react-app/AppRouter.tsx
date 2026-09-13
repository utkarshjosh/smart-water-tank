import { lazy, Suspense } from 'react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RouteFallback, ShellLayout } from '@/components/shell';
import HomePage from '@/app/page';

const WelcomePage = lazy(() => import('@/app/welcome/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const ResetPasswordPage = lazy(() => import('@/app/reset-password/page'));
const SignupPage = lazy(() => import('@/app/signup/page'));
const TenantDevicesPage = lazy(() => import('@/app/app/devices/page'));
const DeviceLayout = lazy(() => import('@/app/app/devices/[deviceId]/DeviceLayout'));
const DeviceOverview = lazy(() => import('@/app/app/devices/[deviceId]/OverviewTab'));
const DeviceHistory = lazy(() => import('@/app/app/devices/[deviceId]/HistoryTab'));
const DeviceAlerts = lazy(() => import('@/app/app/devices/[deviceId]/AlertsTab'));
const DeviceSettings = lazy(() => import('@/app/app/devices/[deviceId]/SettingsTab'));
const OnboardingPage = lazy(() => import('@/app/app/onboarding/page'));
const TankSetupPage = lazy(() => import('@/app/app/onboarding/tank-setup/[deviceId]/page'));
const AdminDashboardPage = lazy(() => import('@/app/admin/dashboard/page'));
const AdminDevicesPage = lazy(() => import('@/app/admin/devices/page'));
const AdminDeviceDetailPage = lazy(() => import('@/app/admin/devices/[deviceId]/page'));
const AdminFirmwarePage = lazy(() => import('@/app/admin/firmware/page'));
const AdminTenantsPage = lazy(() => import('@/app/admin/tenants/page'));
const AdminAnalyticsPage = lazy(() => import('@/app/admin/analytics/page'));

/**
 * Signed-in sections hang off a `ShellLayout` route rather than each page
 * wrapping itself in the shell. That is what makes navigation inside a section
 * an SPA transition: the layout element is identical across its children, so
 * React keeps the sidebar, header and tab bar mounted and only the outlet - and
 * its own Suspense boundary - changes. The Suspense here is left for the public
 * pages, which have no chrome to preserve.
 */
export default function AppRouter() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<RouteFallback />}>
            <HomePage />
          </Suspense>
        }
      />
      <Route element={<PublicRoutes />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<ShellLayout variant="tenant" />}>
        <Route path="/app" element={<Navigate to="/app/devices" replace />} />
        <Route path="/app/devices" element={<TenantDevicesPage />} />

        {/* Device detail is four routes, not one long scroll. Each is a
            screenful on a phone; on desktop DeviceLayout lays them out
            side by side. Deep links and browser back both work. */}
        <Route path="/app/devices/:deviceId" element={<DeviceLayout />}>
          <Route index element={<DeviceOverview />} />
          <Route path="history" element={<DeviceHistory />} />
          <Route path="alerts" element={<DeviceAlerts />} />
          <Route path="settings" element={<DeviceSettings />} />
        </Route>

        <Route path="/app/onboarding" element={<OnboardingPage />} />
        <Route path="/app/onboarding/tank-setup/:deviceId" element={<TankSetupPage />} />
      </Route>

      <Route element={<ShellLayout variant="admin" />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/devices" element={<AdminDevicesPage />} />
        <Route path="/admin/devices/:deviceId" element={<AdminDeviceDetailPage />} />
        <Route path="/admin/firmware" element={<AdminFirmwarePage />} />
        <Route path="/admin/tenants" element={<AdminTenantsPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function PublicRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 text-center">
        <h1 className="text-title">Page not found</h1>
        <p className="mt-2 text-body text-ink-2">That page does not exist.</p>
        <Link
          to="/app/devices"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-label text-brand-ink transition-colors duration-instant ease-out hover:bg-brand-press"
        >
          Back to my tanks
        </Link>
      </div>
    </div>
  );
}
