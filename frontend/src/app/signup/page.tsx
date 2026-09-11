import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { CheckCircle, UserPlus, WarningCircle } from '@phosphor-icons/react';
import api from '@/lib/api';
import { auth } from '@/lib/firebase';
import { AuthLayout } from '@/components/shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function readableSignupError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/email-already-in-use':
        return 'An account already exists for that email. Try logging in instead.';
      case 'auth/invalid-email':
        return 'That does not look like a valid email address.';
      case 'auth/weak-password':
        return 'Pick a longer password — at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Could not reach the server. Check your connection.';
    }
  }
  return err instanceof Error ? err.message : 'Could not create your account. Please try again.';
}

const RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'A number or symbol', test: (p: string) => /[\d\W]/.test(p) },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const met = RULES.map((rule) => rule.test(password));
  const canSubmit = name.trim() !== '' && email.trim() !== '' && met.every(Boolean);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      await api.post('/api/v1/user/register', { name });
      navigate('/app/devices');
    } catch (err) {
      setError(readableSignupError(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Then pair your first sensor — it takes a couple of minutes."
      aside={
        <>
          <h2 className="text-[2rem] leading-tight tracking-tight">
            Start with the readings that matter.
          </h2>
          <p className="mt-4 text-body text-ink-2">
            Pair a device, enter your tank&apos;s height and shape, and AquaMind works out
            the litres for you.
          </p>
          <ol className="mt-7 space-y-3">
            {['Create an account', 'Pair your sensor with its claim code', 'Enter your tank dimensions'].map(
              (step, i) => (
                <li key={step} className="flex items-center gap-3 text-body text-ink-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wash text-caption font-medium text-brand">
                    {i + 1}
                  </span>
                  {step}
                </li>
              )
            )}
          </ol>
        </>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSignup} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Utkarsh Joshi"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
        </div>

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
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          {/* Requirements shown up front and ticked live, rather than only
              surfacing as a server error after submitting. */}
          <ul className="space-y-1 pt-1">
            {RULES.map((rule, i) => (
              <li
                key={rule.label}
                className={`flex items-center gap-1.5 text-caption ${met[i] ? 'text-good-text' : 'text-ink-3'}`}
              >
                <CheckCircle size={13} weight={met[i] ? 'fill' : 'regular'} aria-hidden />
                {rule.label}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <Alert variant="critical" icon={false}>
            <div className="flex gap-2">
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <AlertTitle>Could not sign up</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <Button type="submit" className="w-full" loading={loading} disabled={!canSubmit}>
          <UserPlus size={18} weight="bold" />
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
