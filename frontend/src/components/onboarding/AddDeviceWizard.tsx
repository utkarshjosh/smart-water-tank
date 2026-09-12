import { Suspense, useEffect, useRef, useState } from 'react';
import TankLevel from '@/components/TankLevel';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Network,
  WarningCircle,
  WifiHigh,
} from '@phosphor-icons/react';

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
          setError(
            'That pairing code expired before your device connected. Generate a new one and try again.'
          );
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
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Device paired
              </h2>
              <p className="text-sm text-slate-500">
                {claimedDevice?.name || claimedDevice?.id} is connected to your account.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[0.95fr_1.05fr]">
          <div className="flex items-center justify-center rounded-lg bg-slate-950 px-4 py-5 text-slate-100">
            <div className="scale-[0.68] origin-center">
              <Suspense fallback={tankFallback}>
                <TankLevel level={70} alert={null} />
              </Suspense>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Next step
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  Add tank dimensions to calibrate readings.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-700">Ready for setup</p>
              </div>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                onClick={() => navigate(`/app/onboarding/tank-setup/${claimedDevice?.id}`)}
              >
                Set up tank
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => navigate('/app/devices')}
              >
                View devices
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-sky-100 p-2 text-sky-700">
              <WifiHigh className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Pair device</h2>
              <p className="text-sm text-slate-500">
                Generate a short-lived code and complete setup from the device hotspot.
              </p>
            </div>
          </div>
          <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">
            {step === 'waiting' ? 'Waiting' : 'Ready'}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-2">
          {[
            ['1', 'Hold the device button until the setup light blinks.'],
            ['2', 'Join the WaterTank-Setup WiFi network.'],
            ['3', 'Choose home WiFi and enter the pairing code.'],
          ].map(([number, label]) => (
            <div key={number} className="flex gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
                {number}
              </span>
              <p className="text-sm leading-6 text-slate-600">{label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <div className="flex items-start gap-3">
                <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold leading-none">Error</h3>
                  <p className="mt-1 text-sm leading-relaxed">{error}</p>
                </div>
              </div>
            </div>
          )}

          {claimCode && step === 'waiting' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Pairing code
              </p>
              <div className="mt-2 rounded-lg bg-white px-4 py-4 text-center font-mono text-4xl font-semibold tracking-[0.22em] text-slate-950 shadow-sm">
                {claimCode}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Clock className="h-4 w-4 text-amber-500" />
                Waiting for connection. Expires in {secondsLeft}s.
              </div>
            </div>
          )}

          {step === 'idle' && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
              <Network className="mx-auto h-6 w-6 text-slate-500" />
              <p className="mt-2 text-sm font-medium text-slate-900">No active pairing code</p>
              <p className="text-sm text-slate-500">
                Codes expire quickly to keep account linking controlled.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={generateCode}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            {step === 'idle' ? (
              <>
                <WifiHigh className="mr-2 h-4 w-4" />
                Generate pairing code
              </>
            ) : (
              <>
                <ArrowsClockwise className="mr-2 h-4 w-4" />
                Regenerate code
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
