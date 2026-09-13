import { X } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenScrollContext } from '@/ui/Screen';
import { radius, space, useTheme } from '@/ui/theme';

/**
 * A full-screen sheet whose content is turned on its side.
 *
 * The app is locked to portrait (app.config.ts) and unlocking it, or adding
 * expo-screen-orientation, would mean a native rebuild. Rotating a view the
 * size of the landscape screen by 90° gives the chart the wide canvas it
 * wants without touching the native project. Gesture-handler maps touches
 * through the view's transform, so the chart inside sees its own frame.
 *
 * Android needs a GestureHandlerRootView of its own inside a Modal; the one
 * at the app root does not reach into the modal's window.
 */
export function LandscapeModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Receives the usable size of the rotated content area. */
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Rotated clockwise, the content's top edge lies along the screen's right
  // edge, so each safe-area inset moves one step round.
  const padding = {
    paddingTop: insets.right + space.sm,
    paddingRight: insets.bottom + space.md,
    paddingBottom: insets.left + space.sm,
    paddingLeft: insets.top + space.md,
  };
  const size = {
    width: screenHeight - padding.paddingLeft - padding.paddingRight,
    height: screenWidth - padding.paddingTop - padding.paddingBottom,
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="fullScreen"
      supportedOrientations={['portrait']}
    >
      <GestureHandlerRootView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.rotated,
            padding,
            {
              width: screenHeight,
              height: screenWidth,
              // Centre the landscape box on the portrait screen, then turn it.
              left: (screenWidth - screenHeight) / 2,
              top: (screenHeight - screenWidth) / 2,
            },
          ]}
        >
          {/* The page's scroll view is in another window now; nothing in here should reach it. */}
          <ScreenScrollContext.Provider value={null}>{children(size)}</ScreenScrollContext.Provider>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The close affordance, styled to sit in the chart's readout row. */
export function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[styles.iconButton, { borderColor: colors.border }]}
    >
      <X size={18} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  rotated: { position: 'absolute', transform: [{ rotate: '90deg' }] },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
