import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { AlertCircle, BellRing, Droplets, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      await api.post('/api/v1/user/register', { name });
      navigate('/app/devices');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
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
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <BellRing className="h-3.5 w-3.5" />
              Tenant monitoring
            </div>
            <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight">
              Start with the essential signals, not a crowded dashboard.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
              Create an account to pair devices, set tank dimensions, and track live water levels from a focused workspace.
            </p>

            <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
                <span>Setup progress</span>
                <span>2 min</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-slate-950" />
                <div className="h-1.5 rounded-full bg-cyan-500" />
                <div className="h-1.5 rounded-full bg-slate-200" />
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-100 text-cyan-700">
                  <Droplets className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">Pair device, calibrate tank, monitor.</div>
                  <div className="mt-0.5 text-xs text-slate-500">No manual tenant setup required.</div>
                </div>
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
              <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
              <p className="mt-2 text-sm text-slate-500">Set up your water monitoring workspace.</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-700">
                  Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  className="border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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
                    Creating account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Sign up
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-slate-950 hover:underline">
                  Log in
                </Link>
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
