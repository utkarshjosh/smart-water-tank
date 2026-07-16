import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
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
        setError(err instanceof Error ? err.message : 'Unable to send the password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <main className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
          {sent ? <MailCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </div>

        {sent ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                If an AquaMind account uses that email address, we&apos;ve sent instructions for choosing a new password.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Didn&apos;t receive it? Check spam or request another email after a few minutes.
            </p>
            <Button asChild className="w-full bg-slate-950 text-white hover:bg-slate-800">
              <Link to="/login">Return to login</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your account email and we&apos;ll send you a secure password-reset link.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={loading}
                  className="border-slate-200 bg-white"
                />
              </div>
              {error && (
                <Alert variant="destructive" className="bg-white">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Unable to send email</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full bg-slate-950 text-white hover:bg-slate-800"
                disabled={loading}
              >
                {loading ? 'Sending reset link...' : 'Send reset link'}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
