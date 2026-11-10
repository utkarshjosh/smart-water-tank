import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretDown, CaretUp, Minus, Plus } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/api/endpoints';
import { queryKeys, useDevices, useTankProfile } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { formatLitres } from '@/lib/format';
import { MAX_UNITS, describeSensor, evaluateTank, formFromProfile, type TankForm } from '@/lib/tank-setup';
import { Button, Divider, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, type as typeScale, useTheme } from '@/ui/theme';

/** A number pad that still has a minus sign: Android's numeric pad does, iOS needs the punctuation one. */
const SIGNED_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

/**
 * Tank dimensions and sensor position for one tank.
 *
 * One scrolling form rather than the web's four steps: on a phone the whole
 * thing is five fields, and steps would only add taps. The sensor distances
 * stay folded away behind their one-line summary, because most people set
 * them once at install and never again, and open by themselves when they are
 * the reason for a warning.
 */
export default function TankSetupScreen() {
  const router = useRouter();
  const { device: deviceId } = useLocalSearchParams<{ device: string }>();
  const { colors } = useTheme();
  const client = useQueryClient();
  const devices = useDevices();
  const device = devices.data?.find((d) => d.id === deviceId);
  const profile = useTankProfile(deviceId);

  // The stored profile until the first edit, then the draft: a background
  // refetch must not overwrite what is being typed.
  const [draft, setDraft] = useState<TankForm | null>(null);
  const form = draft ?? (profile.isSuccess ? formFromProfile(profile.data) : null);

  const result = form ? evaluateTank(form) : null;
  // Folded away unless it is the reason for a warning, or the user chose.
  const warned = !!result && (result.shortfallCm !== null || result.problem !== null);
  const [sensorChoice, setSensorChoice] = useState<boolean | null>(null);
  const sensorOpen = sensorChoice ?? warned;

  const save = useMutation({
    mutationFn: () => api.saveTankProfile(deviceId!, result!.payload!),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.tankProfile(deviceId!), saved);
      // Litres, percent and usage are all derived from the profile.
      void client.invalidateQueries({ queryKey: ['device', deviceId] });
      void client.invalidateQueries({ queryKey: queryKeys.devices });
      haptics.success();
      router.back();
    },
  });

  const set = (patch: Partial<TankForm>) => form && setDraft({ ...form, ...patch });

  return (
    <Screen title="Tank setup" subtitle={device?.name} onBack={() => router.back()}>
      {!form ? (
        <View style={styles.section}>
          <Text variant="body" color="mutedForeground">
            {profile.isError ? 'Couldn’t load this tank’s setup.' : 'Loading…'}
          </Text>
          {profile.isError && <Button title="Try again" variant="secondary" onPress={() => profile.refetch()} />}
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Label>Shape</Label>
            <View style={styles.choices}>
              <Choice
                label="Round"
                hint="Plastic household tank"
                active={form.shape === 'cylindrical'}
                onPress={() => set({ shape: 'cylindrical' })}
              />
              <Choice
                label="Box"
                hint="Sump or masonry tank"
                active={form.shape === 'cuboidal'}
                onPress={() => set({ shape: 'cuboidal' })}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Label>Size</Label>
            <Field label="Height" value={form.heightCm} onChange={(heightCm) => set({ heightCm })} />
            <Divider />
            {form.shape === 'cylindrical' ? (
              <Field label="Diameter" value={form.diameterCm} onChange={(diameterCm) => set({ diameterCm })} />
            ) : (
              <>
                <Field label="Length" value={form.lengthCm} onChange={(lengthCm) => set({ lengthCm })} />
                <Divider />
                <Field label="Width" value={form.widthCm} onChange={(widthCm) => set({ widthCm })} />
              </>
            )}
            <Divider />
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="body">Tanks joined together</Text>
                <Text variant="caption" color="mutedForeground">
                  Identical tanks that fill and drain as one.
                </Text>
              </View>
              <Stepper value={form.units} min={1} max={MAX_UNITS} onChange={(units) => set({ units })} />
            </View>
          </View>

          <View style={styles.section}>
            <Pressable
              onPress={() => setSensorChoice(!sensorOpen)}
              accessibilityRole="button"
              accessibilityState={{ expanded: sensorOpen }}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Label>Sensor position</Label>
                {!sensorOpen && (
                  <Text variant="caption" color="mutedForeground" numeric>
                    {describeSensor(form)}
                  </Text>
                )}
              </View>
              {sensorOpen ? (
                <CaretUp size={18} color={colors.mutedForeground} />
              ) : (
                <CaretDown size={18} color={colors.mutedForeground} />
              )}
            </Pressable>
            {sensorOpen && (
              <>
                <Field
                  label="Height above the tank top"
                  help="Negative if the sensor hangs inside the tank, for example -5."
                  value={form.sensorOffsetCm}
                  onChange={(sensorOffsetCm) => set({ sensorOffsetCm })}
                  signed
                />
                <Divider />
                <Field
                  label="Distance to the water when full"
                  help="Measured from the sensor face with the tank full. Leave blank if you haven’t measured it."
                  value={form.fullDistanceCm}
                  onChange={(fullDistanceCm) => set({ fullDistanceCm })}
                  placeholder="—"
                />
                <Divider />
                <Field
                  label="Nearest the sensor can measure"
                  help="About 25 cm for the JSN-SR04T sensor."
                  value={form.deadZoneCm}
                  onChange={(deadZoneCm) => set({ deadZoneCm })}
                />
              </>
            )}
          </View>

          {result?.problem ? (
            <Text variant="body" color="crit">
              {result.problem}
            </Text>
          ) : result?.shortfallCm != null ? (
            <Text variant="body" color="warn" numeric>
              When full, the water is closer to the sensor than it can measure, so readings near the top will be
              wrong. Raise the sensor by at least {Math.ceil(result.shortfallCm)} cm, or lower the full level by
              the same amount.
            </Text>
          ) : null}

          <View style={styles.section}>
            {result?.capacityL != null && (
              <View style={styles.rowText}>
                <Text variant="title" numeric>
                  {formatLitres(result.capacityL)} when full
                </Text>
                {result.brimL != null && result.brimL - result.capacityL >= 1 && (
                  <Text variant="caption" color="mutedForeground" numeric>
                    {formatLitres(result.brimL)} to the brim.{' '}
                    {form.fullDistanceCm.trim() === ''
                      ? 'This is the part the sensor can measure.'
                      : 'This is what it holds at its full level.'}
                  </Text>
                )}
              </View>
            )}
            {save.isError && (
              <Text variant="caption" color="crit">
                Couldn’t save: {save.error.message}
              </Text>
            )}
            <Button
              title="Save"
              feedback="selection"
              disabled={!result?.payload}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

function Choice({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[
        styles.choice,
        { backgroundColor: active ? colors.secondary : 'transparent', borderColor: active ? colors.primary : colors.border },
      ]}
    >
      <Text variant="heading" color={active ? 'primary' : 'foreground'}>
        {label}
      </Text>
      <Text variant="caption" color="mutedForeground">
        {hint}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder = '0',
  signed,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Allows a minus sign. */
  signed?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="body">{label}</Text>
        {!!help && (
          <Text variant="caption" color="mutedForeground">
            {help}
          </Text>
        )}
      </View>
      <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={signed ? SIGNED_KEYBOARD : 'decimal-pad'}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          style={[styles.input, typeScale.body, { color: colors.foreground }]}
          accessibilityLabel={`${label}, centimetres`}
        />
        <Text variant="body" color="mutedForeground">
          cm
        </Text>
      </View>
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const { colors } = useTheme();
  const step = (delta: number, label: string, icon: ReactNode, disabled: boolean) => (
    <Pressable
      onPress={() => {
        haptics.selection();
        onChange(value + delta);
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.stepButton, { borderColor: colors.border, opacity: disabled ? 0.4 : 1 }]}
    >
      {icon}
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {step(-1, 'One tank fewer', <Minus size={16} color={colors.foreground} />, value <= min)}
      <Text variant="heading" numeric style={styles.stepValue}>
        {value}
      </Text>
      {step(1, 'One tank more', <Plus size={16} color={colors.foreground} />, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 2,
    padding: space.md,
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  rowText: { flex: 1, gap: 2 },
  inputWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  input: { minWidth: 56, paddingVertical: space.sm, textAlign: 'right' },
  stepper: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  stepButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepValue: { minWidth: 20, textAlign: 'center' },
});
