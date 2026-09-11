import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { queryKeys } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { Button, Card, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { space, useTheme } from '@/ui/theme';
import { GlassTank } from '@/viz/GlassTank';

/**
 * Pairing: mint a short-lived claim code, the user types it into the node's
 * setup portal, the node exchanges it for a device token and we see it appear.
 *
 * Mirrors the web AddDeviceWizard against the same endpoints. The instructions
 * are deliberately concrete about the portal, because the user is standing at
 * the tank with a phone and cannot guess what "config portal" means.
 */

const POLL_MS = 3000;

export default function PairScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paired, setPaired] = useState<{ name: string } | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mint = useMutation({
    mutationFn: () => api.mintClaimCode(),
    onSuccess: (data) => {
      setError('');
      setPaired(null);
      setSecondsLeft(Math.round(data.expires_in_seconds));
    },
    onError: (err: Error) => setError(err.message),
  });

  const code = mint.data?.claim_code ?? null;
  const expiresAt = mint.data?.expires_at ?? null;

  function stopTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  useEffect(() => stopTimers, []);

  useEffect(() => {
    if (!code || !expiresAt || paired) return;

    tickRef.current = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)));
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getClaimStatus(code);
        if (status.status === 'claimed') {
          stopTimers();
          haptics.success();
          setPaired({ name: status.device?.name ?? 'Your tank' });
          void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
        } else if (status.status === 'expired') {
          stopTimers();
          setError('That code expired before the node connected. Generate a new one.');
        }
      } catch {
        // A dropped poll is not a failure; the next tick retries.
      }
    }, POLL_MS);

    return stopTimers;
  }, [code, expiresAt, paired]);

  if (paired) {
    return (
      <Screen title="Tank paired" onBack={() => router.back()}>
        <Card accent="ok">
          <View style={styles.successRow}>
            <GlassTank level={68} width={72} height={110} />
            <View style={styles.successText}>
              <Text variant="heading">{paired.name} is connected</Text>
              <Text variant="body" color="mutedForeground">
                Readings appear as soon as the node reports — usually within a few minutes.
              </Text>
            </View>
          </View>
          <Button title="Done" onPress={() => router.replace('/')} feedback="selection" />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Pair a tank" subtitle="About a minute" onBack={() => router.back()}>
      {!code ? (
        <Card>
          <Text variant="body" color="mutedForeground">
            You will need the node powered on and within reach. We generate a short code, you type it
            into the node&rsquo;s setup page, and it joins this account.
          </Text>
          <Button
            title="Generate pairing code"
            onPress={() => mint.mutate()}
            loading={mint.isPending}
            feedback="selection"
          />
          {!!error && (
            <Text variant="caption" color="crit">
              {error}
            </Text>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <Label>Pairing code</Label>
            <Text variant="hero" numeric style={styles.code}>
              {code}
            </Text>
            <Text variant="caption" color={secondsLeft < 60 ? 'warn' : 'mutedForeground'} numeric>
              {secondsLeft > 0
                ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                : 'Expired'}
            </Text>
          </Card>

          <Card>
            <Label>On your phone</Label>
            <Step n={1} text="Open Wi-Fi settings and join the network the node is broadcasting (it starts with AquaMind)." />
            <Step n={2} text="A setup page opens automatically. If it does not, visit 192.168.4.1 in your browser." />
            <Step n={3} text="Pick your home Wi-Fi, enter its password, and type the code above into the pairing field." />
            <Step n={4} text="Save. The node reboots, joins your Wi-Fi, and appears here on its own." />
          </Card>

          <View style={[styles.waiting, { borderColor: colors.border }]}>
            <Text variant="caption" color="mutedForeground">
              Waiting for the node to connect…
            </Text>
          </View>

          {!!error && (
            <Text variant="caption" color="crit">
              {error}
            </Text>
          )}

          <Button
            title="Generate a new code"
            variant="ghost"
            onPress={() => mint.mutate()}
            loading={mint.isPending}
          />
        </>
      )}
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <Text variant="caption" color="primary" numeric style={styles.stepNumber}>
        {n}
      </Text>
      <Text variant="body" color="mutedForeground" style={styles.stepText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  code: { letterSpacing: 6 },
  step: { flexDirection: 'row', gap: space.md },
  stepNumber: { width: 14 },
  stepText: { flex: 1 },
  waiting: {
    alignItems: 'center',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: space.lg,
  },
  successRow: { alignItems: 'center', flexDirection: 'row', gap: space.lg },
  successText: { flex: 1, gap: space.xs },
});
