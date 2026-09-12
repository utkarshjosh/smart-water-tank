import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import notifee from '@notifee/react-native';

import { clearPersistedCache } from '@/api/queryClient';
import { useAuth } from '@/auth/AuthProvider';
import { hapticsEnabled, setHapticsEnabled, haptics } from '@/feedback/haptics';
import { lastRegisteredToken, registerForPush } from '@/push/registration';
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
  const [enablingPush, setEnablingPush] = useState(false);

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
    <Screen title="Settings" onBack={() => router.back()}>
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

      <Card accent={pushRegistered ? undefined : 'warn'}>
        <Label>Alerts</Label>
        {pushRegistered ? (
          <Text variant="body" color="mutedForeground">
            This phone receives tank alerts. Per-alert sounds and importance are yours to tune in
            Android&rsquo;s notification settings for AquaMind.
          </Text>
        ) : (
          <>
            <Text variant="body" color="mutedForeground">
              Notifications are off, so a low tank or a leak will not reach this phone.
            </Text>
            <Button
              title="Turn on alerts"
              variant="secondary"
              loading={enablingPush}
              onPress={async () => {
                setEnablingPush(true);
                try {
                  const result = await registerForPush();
                  setPushRegistered(result.granted);
                  // Permission denied twice is permanent from in-app: Android
                  // only grants it from system settings after that.
                  if (!result.granted) await notifee.openNotificationSettings();
                } finally {
                  setEnablingPush(false);
                }
              }}
            />
          </>
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
