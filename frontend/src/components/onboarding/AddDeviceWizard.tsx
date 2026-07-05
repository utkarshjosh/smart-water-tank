import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { AlertCircle, RefreshCw, CheckCircle2, Wifi } from 'lucide-react';

const GlassTank = lazy(() => import('@/components/GlassTank'));

type ClaimCodeResponse = {
  claim_code: string;
  expires_at: string;
  expires_in_seconds: number;
};

type ClaimStatus = 'pending' | 'claimed' | 'expired';

type ClaimedDevice = {
  id: string;
  name: string;
  status: string;
};

const POLL_INTERVAL_MS = 3000;

export function AddDeviceWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'idle' | 'generate' | 'waiting' | 'success'>('idle');
  const [claimCode, setClaimCode] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [claimedDevice, setClaimedDevice] = useState<ClaimedDevice | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tankFallback = (
    <div className="mx-auto flex h-60 w-48 items-center justify-center rounded-[2rem] border border-slate-700 bg-slate-900/40">
      <div className="h-20 w-20 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
    </div>
  );

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const generateCode = async () => {
    setError('');
    clearTimers();
    try {
      const { data } = await api.post<ClaimCodeResponse>('/api/v1/user/devices/claim-code', {});
      setClaimCode(data.claim_code);
      const expires = new Date(data.expires_at);
      setExpiresAt(expires);
      setSecondsLeft(data.expires_in_seconds);
      setStep('waiting');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to generate a pairing code');
    }
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (step !== 'waiting' || !claimCode) return;

    countdownRef.current = setInterval(() => {
      if (!expiresAt) return;
      const remaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/v1/user/devices/claim-code/${claimCode}/status`);
        const status: ClaimStatus = data.status;
        if (status === 'claimed') {
          clearTimers();
          setClaimedDevice(data.device);
          setStep('success');
        } else if (status === 'expired') {
          clearTimers();
          setError('That pairing code expired before your device connected. Generate a new one and try again.');
          setStep('generate');
        }
      } catch (err) {
        // transient network hiccups shouldn't kill the poll loop
        console.error('Error polling claim code status:', err);
      }
    }, POLL_INTERVAL_MS);

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, claimCode]);

  if (step === 'success') {
    return (
      <div className="rounded-3xl border-2 border-border/80 bg-card shadow-xl">
        <div className="space-y-2 px-6 pb-0 pt-6 text-center">
          <div className="flex justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Device paired!</h2>
          <p className="text-sm text-muted-foreground">
            {claimedDevice?.name || claimedDevice?.id} is connected to your account.
          </p>
        </div>
        <div className="flex flex-col items-center gap-6 p-6">
          <div className="rounded-3xl bg-[#0f172a] p-6 w-full flex justify-center">
            <div className="scale-75 origin-top">
              <Suspense fallback={tankFallback}>
                <GlassTank level={70} alert={null} />
              </Suspense>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => navigate(`/app/onboarding/tank-setup/${claimedDevice?.id}`)}
          >
            Set up your tank
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => navigate('/app/devices')}
          >
            Go to my devices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border-2 border-border/80 bg-card shadow-xl">
      <div className="space-y-2 px-6 pb-0 pt-6 text-center">
        <div className="flex justify-center">
          <Wifi className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Pair your device</h2>
        <p className="text-sm text-muted-foreground">
          {step === 'idle'
            ? "When you're ready, generate a pairing code for your AquaMind device."
            : (
              <>
                Long-press the button on your AquaMind device until it starts blinking, then
                connect your phone or laptop to the <span className="font-medium">WaterTank-Setup</span> WiFi
                network it creates. Choose your home WiFi, enter its password, and when prompted,
                type in the pairing code below.
              </>
            )}
        </p>
      </div>
      <div className="flex flex-col items-center gap-6 p-6">
        {error && (
          <div className="w-full rounded-lg border border-destructive/50 bg-background p-4 text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <h3 className="mb-1 text-sm font-medium leading-none">Error</h3>
                <p className="text-sm leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        )}

        {claimCode && step === 'waiting' && (
          <>
            <div className="text-5xl font-mono font-bold tracking-[0.3em] bg-muted rounded-xl px-8 py-6">
              {claimCode}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Waiting for your device to connect... expires in {secondsLeft}s
            </div>
          </>
        )}

        <button
          type="button"
          onClick={generateCode}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {step === 'idle' ? (
            <>
              <Wifi className="mr-2 h-4 w-4" />
              Generate pairing code
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate code
            </>
          )}
        </button>
      </div>
    </div>
  );
}
