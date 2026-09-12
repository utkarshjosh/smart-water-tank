import { Stack } from 'expo-router';

import { useTheme } from '@/ui/theme';

/**
 * A stack, not a tab bar.
 *
 * Households here have one tank, so a tab bar would spend a third of the bottom
 * edge on a list with one row. Tanks is the root; Settings is a header action;
 * detail and pairing push. The Activity tab arrives with the tenant-wide alert
 * feed (plan §5.3) rather than as an empty shell now.
 */
export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="device/[id]" />
      <Stack.Screen name="alerts" />
      <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="pair" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
