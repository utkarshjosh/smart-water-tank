import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import notifee from '@notifee/react-native';

import { clearPersistedCache } from '@/api/queryClient';
import { useAuth } from '@/auth/AuthProvider';
import { hapticsEnabled, setHapticsEnabled, haptics } from '@/feedback/haptics';
import { summariseRules, useAlertRules } from '@/api/alert-rules';
import { useDevices } from '@/api/queries';
import { lastRegisteredToken, registerForPush, unregisterForPush } from '@/push/registration';
import { Button, Card, Divider, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, useTheme, type ThemePreference } from '@/ui/theme';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const [haptic, setHaptic] = useState(hapticsEnabled);
  const [signingOut, setSigningOut] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(() => !!lastRegisteredToken());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);
  const devices = useDevices();

  async function togglePush(next: boolean) {
    setPushBusy(true);
    try {
      if (next) {
        const result = await registerForPush();
        setPushRegistered(result.granted);
        // Denied twice is permanent from in-app; only system settings can
        // grant it after that, so point there instead of asking again.
        setPushDenied(!result.granted);
        if (result.granted) haptics.success();
      } else {
        await unregisterForPush();
        setPushRegistered(false);
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.signOut();
      // The next account must not inherit this one's cached tanks.
      clearPersistedCache();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen title="Settings">
      <Card>
        <Label>Account</Label>
        <Text variant="body">{auth.user?.email ?? 'Signed out'}</Text>
        {!!auth.user?.displayName && (
          <Text variant="caption" color="mutedForeground">
            {auth.user.displayName}
          </Text>
        )}
      </Card>

      <Card>
        <Label>Appearance</Label>
        <View style={styles.segments}>
          {THEMES.map((option) => {
            const active = option.value === preference;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  haptics.selection();
                  setPreference(option.value);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? colors.primary : 'transparent',
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text variant="caption" color={active ? 'primaryForeground' : 'mutedForeground'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Label>Alerts</Label>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text variant="body">Notifications on this phone</Text>
            <Text variant="caption" color="mutedForeground">
              {pushRegistered
                ? 'Sound and importance per alert are in Android\u2019s notification settings.'
                : 'Off — a low tank or a leak will not reach this phone.'}
            </Text>
          </View>
          <Switch
            value={pushRegistered}
            disabled={pushBusy}
            onValueChange={togglePush}
            trackColor={{ true: colors.primary, false: colors.muted }}
          />
        </View>
        {pushDenied && (
          <Pressable onPress={() => notifee.openNotificationSettings()} hitSlop={8} accessibilityRole="link">
            <Text variant="caption" color="primary">
              Blocked by Android — open notification settings
            </Text>
          </Pressable>
        )}
        <Divider />
        <Label>Alert rules</Label>
        {(devices.data ?? []).map((device) => (
          <Pressable
            key={device.id}
            onPress={() => router.push({ pathname: '/alert-rules', params: { device: device.id } })}
            accessibilityRole="button"
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text variant="body">{device.name}</Text>
              <RulesSummary deviceId={device.id} />
            </View>
            <CaretRight size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
        {devices.data?.length === 0 && (
          <Text variant="caption" color="mutedForeground">
            Pair a tank to choose which alerts it raises.
          </Text>
        )}
      </Card>

      <Card>
        <Label>Feedback</Label>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text variant="body">Haptics</Text>
            <Text variant="caption" color="mutedForeground">
              A short tick when something actually changes.
            </Text>
          </View>
          <Switch
            value={haptic}
            onValueChange={(next) => {
              setHapticsEnabled(next);
              setHaptic(next);
              if (next) haptics.selection();
            }}
            trackColor={{ true: colors.primary, false: colors.muted }}
          />
        </View>
      </Card>

      <Card>
        <Label>About</Label>
        <View style={styles.row}>
          <Text variant="body" color="mutedForeground">
            Version
          </Text>
          <Text variant="body" numeric>
            {Constants.expoConfig?.version ?? '—'}
          </Text>
        </View>
        <Divider />
        <View style={styles.row}>
          <Text variant="body" color="mutedForeground">
            Backend
          </Text>
          <Text variant="caption" numeric>
            {String(Constants.expoConfig?.extra?.apiUrl ?? '—').replace(/^https?:\/\//, '')}
          </Text>
        </View>
      </Card>

      <Button title="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
    </Screen>
  );
}

/** "4 of 5 on · Low 20% · Full 95%" — the whole rule set in one glance. */
function RulesSummary({ deviceId }: { deviceId: string }) {
  const rules = useAlertRules(deviceId);
  return (
    <Text variant="caption" color="mutedForeground" numeric>
      {rules.data ? summariseRules(rules.data) : rules.isError ? 'Rules unavailable' : '…'}
    </Text>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: space.xs },
  segment: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  rowText: { flex: 1, gap: 2 },
});
