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
        <Route
          path="/admin/devices"
          element={
            <ShellPage
              title="Devices migration pending"
              description="The Vite shell is live. Admin devices is the next page to move over from the legacy Next app."
              backHref="/admin/dashboard"
            />
          }
        />
        <Route
          path="/admin/firmware"
          element={
            <ShellPage
              title="Firmware migration pending"
              description="This route is intentionally stubbed so navigation works while the remaining admin pages are ported incrementally."
              backHref="/admin/dashboard"
            />
          }
        />
        <Route
          path="/admin/tenants"
          element={
            <ShellPage
              title="Tenants migration pending"
              description="The new client-side app keeps the route stable even though the tenant management screen is still on the migration backlog."
              backHref="/admin/dashboard"
            />
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ShellPage
              title="Analytics migration pending"
              description="Analytics remains to be moved. The route stays addressable so the new shell can replace Next without dead links."
              backHref="/admin/dashboard"
            />
          }
        />
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
