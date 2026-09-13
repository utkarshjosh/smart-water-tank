import { createContext, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft } from 'phosphor-react-native';
import { Pressable, RefreshControl, StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/feedback/haptics';
import { Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

/**
 * What a gesture-driven child (the chart) needs from the page's scroll view:
 * a handle to declare gesture relations against, and a way to freeze vertical
 * scrolling while a pinch is in progress.
 */
type ScreenScroll = {
  scrollRef: RefObject<RNScrollView | null>;
  setScrollEnabled: (enabled: boolean) => void;
};

/** Exported so a Modal can cut its subtree off from the page's scroll view. */
export const ScreenScrollContext = createContext<ScreenScroll | null>(null);

/** Null outside a Screen (e.g. inside a Modal), so callers must tolerate it. */
export function useScreenScroll(): ScreenScroll | null {
  return useContext(ScreenScrollContext);
}

/**
 * Page chrome: safe-area padding, a plain top bar, and the refresh gesture.
 *
 * The scroll view is gesture-handler's, not React Native's: on Android the
 * stock one intercepts a second finger before a child Pinch can claim it,
 * which made the chart un-zoomable. Gesture-handler's joins the same
 * orchestrator as the chart's gestures, so a horizontal pan or pinch on the
 * chart cancels the scroll and a vertical swipe still scrolls.
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
  const scrollRef = useRef<RNScrollView>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scroll = useMemo<ScreenScroll>(() => ({ scrollRef, setScrollEnabled }), []);

  return (
    <ScrollView
      ref={scrollRef}
      scrollEnabled={scrollEnabled}
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
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.back}
          >
            <ArrowLeft size={18} color={colors.primary} />
            <Text variant="heading" color="primary">
              Back
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
      <ScreenScrollContext.Provider value={scroll}>{children}</ScreenScrollContext.Provider>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingHorizontal: space.lg },
  header: { gap: space.sm },
  back: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: space.xs },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  headerText: { flex: 1, gap: 2 },
});
