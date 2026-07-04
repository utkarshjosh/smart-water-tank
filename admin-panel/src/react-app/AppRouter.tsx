import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gauge, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const HomePage = lazy(() => import('@/app/page'));
const WelcomePage = lazy(() => import('@/app/welcome/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const SignupPage = lazy(() => import('@/app/signup/page'));
const TenantLayout = lazy(() => import('@/components/TenantLayout'));
const TenantDevicesPage = lazy(() => import('@/app/app/devices/page'));
const OnboardingPage = lazy(() => import('@/app/app/onboarding/page'));
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
      <Card className="w-full max-w-xl border-white/10 bg-white/5 text-slate-50 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
            <Gauge className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <CardTitle>{title}</CardTitle>
            <CardDescription className="text-slate-300">{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <Link to={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Link>
          </Button>
        </CardContent>
      </Card>
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
          path="/app/onboarding"
          element={
            <TenantLayout>
              <OnboardingPage />
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
