import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, EnvelopeSimple, Key, WarningCircle } from '@phosphor-icons/react';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Web password-reset emails use Firebase's email action handler. They do not
      // require Firebase Dynamic Links, which have been deprecated for mobile flows.
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err: unknown) {
      if (err instanceof FirebaseError && err.code === 'auth/user-not-found') {
        // Do not reveal whether an address is registered.
        setSent(true);
      } else {
        setError(
          err instanceof Error
            ? 'Could not send the reset email. Check the address and try again.'
            : 'Could not send the reset email. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-6">
      <main className="w-full max-w-md rounded-xl border border-hairline bg-surface p-6 sm:p-8">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-label text-ink-2 transition-colors duration-instant hover:text-ink-1"
        >
          <ArrowLeft size={16} />
          Back to log in
        </Link>

        <span className="mt-7 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-wash text-brand">
          {sent ? <EnvelopeSimple size={20} weight="fill" /> : <Key size={20} weight="fill" />}
        </span>

        {sent ? (
          <>
            <h1 className="mt-5 text-[1.5rem] leading-tight tracking-tight">Check your inbox</h1>
            <p className="mt-2 text-body text-ink-2">
              If an account exists for <span className="text-ink-1">{email.trim()}</span>, a reset
              link is on its way. It expires in an hour.
            </p>
            <Button asChild variant="secondary" className="mt-7 w-full">
              <Link to="/login">Back to log in</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[1.5rem] leading-tight tracking-tight">Reset your password</h1>
            <p className="mt-2 text-body text-ink-2">
              Enter the email you signed up with and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleResetPassword} className="mt-7 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error) || undefined}
                />
              </div>

              {error && (
                <Alert variant="critical" icon={false}>
                  <div className="flex gap-2">
                    <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                    <div>
                      <AlertTitle>Could not send the email</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </div>
                  </div>
                </Alert>
              )}

              <Button type="submit" className="w-full" loading={loading} disabled={email.trim() === ''}>
                Send reset link
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
