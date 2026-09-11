import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/feedback/haptics';
import { Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

/**
 * Page chrome: safe-area padding, a plain top bar, and the refresh gesture.
 *
 * The haptic fires when the user commits to a refresh, which is the state
 * change — not on every pull frame.
 */
export function Screen({
  title,
  subtitle,
  action,
  onBack,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl },
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={() => {
              haptics.threshold();
              onRefresh();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        ) : undefined
      }
    >
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Text variant="heading" color="primary">
              ‹ Back
            </Text>
          </Pressable>
        )}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="title">{title}</Text>
            {!!subtitle && (
              <Text variant="caption" color="mutedForeground">
                {subtitle}
              </Text>
            )}
          </View>
          {action}
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingHorizontal: space.lg },
  header: { gap: space.sm },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  headerText: { flex: 1, gap: 2 },
});
