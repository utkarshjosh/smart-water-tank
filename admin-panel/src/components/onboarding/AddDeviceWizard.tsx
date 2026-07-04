'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw, CheckCircle2, Wifi } from 'lucide-react';
import GlassTank from '@/components/GlassTank';

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
  const router = useRouter();
  const [step, setStep] = useState<'generate' | 'waiting' | 'success'>('generate');
  const [claimCode, setClaimCode] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [claimedDevice, setClaimedDevice] = useState<ClaimedDevice | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    generateCode();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <Card className="border-2 shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Device paired!</CardTitle>
          <CardDescription>
            {claimedDevice?.name || claimedDevice?.id} is connected to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div className="rounded-3xl bg-[#0f172a] p-6 w-full flex justify-center">
            <div className="scale-75 origin-top">
              <GlassTank level={70} alert={null} />
            </div>
          </div>
          <Button className="w-full" onClick={() => router.push('/app/devices')}>
            Go to my devices
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 shadow-xl">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          <Wifi className="h-10 w-10 text-primary" />
        </div>
        <CardTitle className="text-2xl">Pair your device</CardTitle>
        <CardDescription>
          Long-press the button on your AquaMind device until it starts blinking, then
          connect your phone or laptop to the <span className="font-medium">WaterTank-Setup</span> WiFi
          network it creates. Choose your home WiFi, enter its password, and when prompted,
          type in the pairing code below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        {error && (
          <Alert variant="destructive" className="w-full">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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

        <Button variant="outline" onClick={generateCode} className="w-full">
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate code
        </Button>
      </CardContent>
    </Card>
  );
}
