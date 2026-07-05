import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('@/app/page'));
const WelcomePage = lazy(() => import('@/app/welcome/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const SignupPage = lazy(() => import('@/app/signup/page'));
const TenantLayout = lazy(() => import('@/components/TenantLayout'));
const TenantDevicesPage = lazy(() => import('@/app/app/devices/page'));
const TenantDeviceDetailPage = lazy(() => import('@/app/app/devices/[deviceId]/page'));
const OnboardingPage = lazy(() => import('@/app/app/onboarding/page'));
const TankSetupPage = lazy(() => import('@/app/app/onboarding/tank-setup/[deviceId]/page'));
const AdminDashboardPage = lazy(() => import('@/app/admin/dashboard/page'));
const AdminDevicesPage = lazy(() => import('@/app/admin/devices/page'));
const AdminDeviceDetailPage = lazy(() => import('@/app/admin/devices/[deviceId]/page'));
const AdminFirmwarePage = lazy(() => import('@/app/admin/firmware/page'));
const AdminTenantsPage = lazy(() => import('@/app/admin/tenants/page'));
const AdminAnalyticsPage = lazy(() => import('@/app/admin/analytics/page'));

function ShellPage({
  title,
  description,
  backHref,
}: {
  title: string;
  description: string;
  backHref: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-50 shadow-2xl">
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-lg font-semibold text-cyan-300">
            !
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
            <p className="text-sm text-slate-300">{description}</p>
          </div>
        </div>
        <div className="pt-6">
          <Link
            to={backHref}
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200"
          >
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/app" element={<Navigate to="/app/devices" replace />} />
        <Route
          path="/app/devices"
          element={
            <TenantLayout>
              <TenantDevicesPage />
            </TenantLayout>
          }
        />
        <Route
          path="/app/devices/:deviceId"
          element={
            <TenantLayout>
              <TenantDeviceDetailPage />
            </TenantLayout>
          }
        />
        <Route
          path="/app/onboarding"
          element={
            <TenantLayout>
              <OnboardingPage />
            </TenantLayout>
          }
        />
        <Route
          path="/app/onboarding/tank-setup/:deviceId"
          element={
            <TenantLayout>
              <TankSetupPage />
            </TenantLayout>
          }
        />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/devices" element={<AdminDevicesPage />} />
        <Route path="/admin/devices/:deviceId" element={<AdminDeviceDetailPage />} />
        <Route path="/admin/firmware" element={<AdminFirmwarePage />} />
        <Route path="/admin/tenants" element={<AdminTenantsPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route
          path="*"
          element={
            <ShellPage
              title="Page not found"
              description="This route is not wired into the React shell yet."
              backHref="/welcome"
            />
          }
        />
      </Routes>
    </Suspense>
  );
}

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
    </div>
  );
}
