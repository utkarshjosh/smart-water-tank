import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/feedback/haptics';
import { Text } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

/** A row of single-choice chips, styled like the device screen's range picker. */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (active) return;
              haptics.selection();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={4}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.primary : 'transparent', borderColor: active ? colors.primary : colors.border },
            ]}
          >
            <Text variant="caption" color={active ? 'primaryForeground' : 'mutedForeground'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
});
