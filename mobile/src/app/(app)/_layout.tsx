import { Stack } from 'expo-router';

import { useTheme } from '@/ui/theme';

/**
 * Tabs at the root, a stack above them.
 *
 * The four primary destinations live in `(tabs)` and cost one thumb tap each,
 * mirroring the webapp's bottom tab bar. Everything that is *about* one tank —
 * detail, pairing, alert rules — pushes over the tabs with the Screen chrome's
 * own back control, so the native header stays hidden throughout.
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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="device/[id]" />
      <Stack.Screen name="alert-rules" />
      <Stack.Screen name="pair" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
