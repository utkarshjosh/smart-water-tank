import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Drop, SignIn, WarningCircle } from '@phosphor-icons/react';
import { homeRouteForRole, useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { useDelayed } from '@/lib/useDelayed';
import { AppLoader, AuthLayout } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Firebase's codes are not sentences; say what the person can act on. */
function readableAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'That email and password do not match an account.';
      case 'auth/invalid-email':
        return 'That does not look like a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a moment, or reset your password.';
      case 'auth/network-request-failed':
        return 'Could not reach the server. Check your connection.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
    }
  }
  return err instanceof Error ? err.message : 'Could not log you in. Please try again.';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { status, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The single redirect path: as soon as AuthProvider resolves an
  // authenticated session (restored or fresh login), leave this page.
  useEffect(() => {
    if (status === 'authenticated') {
      navigate(homeRouteForRole(profile?.role), { replace: true });
    }
  }, [status, profile, navigate]);

  const restoring = status !== 'unauthenticated' && !submitting;
  // Only admit to checking once it has actually taken a noticeable moment;
  // the old version flashed a full-screen spinner on every single visit.
  const showRestoringLoader = useDelayed(restoring, 400);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // The effect above navigates once the profile lands; stay busy until then.
    } catch (err) {
      setError(readableAuthError(err));
      setSubmitting(false);
    }
  };

  if (restoring) {
    return showRestoringLoader ? <AppLoader label="Checking your session" /> : <div className="min-h-screen bg-canvas" />;
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="A clear view of your water starts here. Sign in to your workspace."
      aside={
        <>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-1 text-caption font-medium text-brand">
            <Drop size={14} weight="fill" aria-hidden />
            Connected to what matters
          </span>
          <h2 className="mt-5 text-[2rem] leading-tight tracking-tight">
            Less wondering.
            More peace of mind.
          </h2>
          <p className="mt-4 text-body text-ink-2">
            Know what’s in your tanks. Catch what needs attention. Get on with your day.
          </p>
        </>
      }
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
            aria-invalid={Boolean(error) || undefined}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link to="/reset-password" className="text-caption font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
            aria-invalid={Boolean(error) || undefined}
          />
        </div>

        {error && (
          <Alert variant="critical" icon={false}>
            <div className="flex gap-2">
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <AlertTitle>Could not log in</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <Button type="submit" className="w-full" loading={submitting}>
          <SignIn size={18} weight="bold" />
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
