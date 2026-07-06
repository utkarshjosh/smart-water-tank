import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { AlertCircle, Droplets, Gauge, LogIn, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { setAuthToken } from '@/lib/cookies';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectByRole = async () => {
    try {
      const { data } = await api.get('/api/v1/user/me');
      if (data.role === 'admin' || data.role === 'super_admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/app/devices');
      }
    } catch {
      navigate('/app/devices');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        return;
      }

      const token = await user.getIdToken();
      setAuthToken(token);
      await redirectByRole();
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      setAuthToken(token);
      await redirectByRole();
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="hidden border-r border-slate-200 bg-white px-8 py-7 lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="AquaMind Logo" className="h-9 w-9 object-contain" />
            <div>
              <div className="text-sm font-semibold tracking-tight">AquaMind</div>
              <div className="text-xs text-slate-500">Water operations console</div>
            </div>
          </div>

          <div className="mt-auto max-w-xl pb-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure access
            </div>
            <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight">
              Monitor every tank without the old control-room clutter.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
              Sign in to review live levels, alerts, firmware rollouts, and tenant device health from the compact operations dashboard.
            </p>

            <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Droplets className="mb-4 h-5 w-5 text-cyan-600" />
                <div className="text-2xl font-semibold">24/7</div>
                <div className="mt-1 text-xs text-slate-500">level visibility</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Gauge className="mb-4 h-5 w-5 text-emerald-600" />
                <div className="text-2xl font-semibold">Live</div>
                <div className="mt-1 text-xs text-slate-500">fleet telemetry</div>
              </div>
            </div>
          </div>
        </section>

        <main className="flex min-h-screen items-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src="/logo.png" alt="AquaMind Logo" className="h-9 w-9 object-contain" />
              <div>
                <div className="text-sm font-semibold tracking-tight">AquaMind</div>
                <div className="text-xs text-slate-500">Water operations console</div>
              </div>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
              <p className="mt-2 text-sm text-slate-500">Access your tenant or admin workspace.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@aquamind.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="border-slate-200 bg-white"
                />
              </div>
              {error && (
                <Alert variant="destructive" className="bg-white">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full bg-slate-950 text-white hover:bg-slate-800"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Login
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link to="/signup" className="font-medium text-slate-950 hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
