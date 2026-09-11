import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { haptics } from '@/feedback/haptics';
import { radius, space, type, useTheme, type Colors, type TypeRole } from '@/ui/theme';

type ColorKey = keyof Colors;

export function Text({
  variant = 'body',
  color = 'foreground',
  style,
  numeric,
  ...rest
}: TextProps & { variant?: TypeRole; color?: ColorKey; numeric?: boolean }) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        type[variant] as TextStyle,
        { color: colors[color] },
        // Digits that update in place must not reflow their neighbours.
        numeric ? styles.tabular : null,
        style,
      ]}
    />
  );
}

/** Uppercase micro-label. Used for section eyebrows and metric captions. */
export function Label({ children, color = 'mutedForeground' }: { children: ReactNode; color?: ColorKey }) {
  return (
    <Text variant="label" color={color} style={styles.upper}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Left severity stripe. Omitted means no stripe — not every card needs one. */
  accent?: ColorKey;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        accent ? { borderLeftColor: colors[accent], borderLeftWidth: 3 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Pill({ children, tone = 'mutedForeground' }: { children: ReactNode; tone?: ColorKey }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { borderColor: colors[tone] }]}>
      <Text variant="label" color={tone} style={styles.upper}>
        {children}
      </Text>
    </View>
  );
}

/** Online/offline/stale indicator. Shape carries the state, not just colour. */
export function StatusDot({ tone }: { tone: ColorKey }) {
  const { colors } = useTheme();
  return <View style={[styles.dot, { backgroundColor: colors[tone] }]} />;
}

export const Button = forwardRef<View, PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Haptic fired on press. State changes get one; navigation does not. */
  feedback?: 'none' | 'selection' | 'success';
  loading?: boolean;
}>(function Button({ title, variant = 'primary', feedback = 'none', loading, disabled, onPress, style, ...rest }, ref) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.secondary : 'transparent';
  const label =
    variant === 'primary' ? colors.primaryForeground : variant === 'secondary' ? colors.secondaryForeground : colors.primary;

  return (
    <Pressable
      ref={ref}
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(event) => {
        if (feedback === 'selection') haptics.selection();
        if (feedback === 'success') haptics.success();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'ghost' ? 'transparent' : background,
          opacity: isDisabled ? 0.5 : pressed ? 0.86 : 1,
        },
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      <RNText style={[type.heading as TextStyle, { color: label }]}>{loading ? 'Working…' : title}</RNText>
    </Pressable>
  );
});

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  upper: { textTransform: 'uppercase' },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: space.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});
