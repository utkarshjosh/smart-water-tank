import { useRouter } from 'expo-router';
import { CaretRight, DotsThreeVertical, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { isUnsupportedByServer, useDevices, useRemoveDevice, useRenameDevice } from '@/api/queries';
import type { DeviceSummary } from '@/api/schemas';
import { haptics } from '@/feedback/haptics';
import { formatAge } from '@/lib/format';
import { Button, Card, Divider, StatusDot, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, type as typeScale, useTheme } from '@/ui/theme';

/**
 * Devices — the hardware view of the account, one row per node.
 *
 * Tanks is about water; this is about the boxes on the wall: reachable or
 * not, when they last spoke, what firmware they run. Tapping a row opens the
 * same detail as Tanks. The overflow on each row holds the two management
 * actions (rename, remove) in a bottom sheet, which is where Android users
 * look for them; rename then happens inline in the row.
 */
export default function DevicesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const devices = useDevices();
  const rename = useRenameDevice();
  const remove = useRemoveDevice();
  const [menuFor, setMenuFor] = useState<DeviceSummary | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ deviceId: string; message: string } | null>(null);

  const list = devices.data ?? [];

  function confirmRemove(device: DeviceSummary) {
    setMenuFor(null);
    Alert.alert(
      `Remove ${device.name}?`,
      'It stops appearing in this account and its readings are no longer visible here. You can pair it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(device.id, {
              onSuccess: () => {
                haptics.success();
                setNotice(null);
              },
              onError: (error) =>
                setNotice({
                  deviceId: device.id,
                  message: isUnsupportedByServer(error)
                    ? 'This server can’t remove devices yet.'
                    : `Couldn’t remove — ${error.message}`,
                }),
            }),
        },
      ]
    );
  }

  function submitRename(device: DeviceSummary, name: string) {
    setEditingId(null);
    if (name.trim() === (device.name === device.id ? '' : device.name)) return;
    rename.mutate(
      { deviceId: device.id, name },
      {
        onSuccess: () => {
          haptics.selection();
          setNotice(null);
        },
        onError: (error) => setNotice({ deviceId: device.id, message: `Couldn’t rename — ${error.message}` }),
      }
    );
  }

  const addButton = (
    <Pressable
      onPress={() => router.push('/pair')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Add device"
      style={[styles.iconButton, { borderColor: colors.border }]}
    >
      <Plus size={20} color={colors.primary} />
    </Pressable>
  );

  if (devices.isPending && !devices.data) {
    return (
      <Screen title="Devices">
        <Text variant="body" color="mutedForeground">
          Loading…
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Devices"
      subtitle={list.length ? `${list.length} paired` : undefined}
      action={list.length ? addButton : undefined}
      onRefresh={() => void devices.refetch()}
      refreshing={devices.isFetching}
    >
      {devices.isError && !devices.data && (
        <Card accent="crit">
          <Text variant="heading">Could not reach AquaMind</Text>
          <Text variant="body" color="mutedForeground">
            {devices.error.message}
          </Text>
        </Card>
      )}

      {list.length === 0 && !devices.isError && (
        <Card>
          <Text variant="heading">No devices yet</Text>
          <Text variant="body" color="mutedForeground">
            Power up your AquaMind node, then pair it with this account. It takes about a minute.
          </Text>
          <Button title="Add device" onPress={() => router.push('/pair')} feedback="selection" />
        </Card>
      )}

      {list.length > 0 && (
        <Card style={styles.list}>
          {list.map((device, index) => (
            <View key={device.id}>
              {index > 0 && <Divider />}
              <DeviceRow
                device={device}
                editing={editingId === device.id}
                busy={remove.isPending && remove.variables === device.id}
                notice={notice?.deviceId === device.id ? notice.message : null}
                onOpen={() => router.push(`/device/${device.id}`)}
                onMenu={() => setMenuFor(device)}
                onSubmitName={(name) => submitRename(device, name)}
                onCancelEdit={() => setEditingId(null)}
              />
            </View>
          ))}
        </Card>
      )}

      <ActionSheet
        device={menuFor}
        onClose={() => setMenuFor(null)}
        onRename={() => {
          if (menuFor) setEditingId(menuFor.id);
          setMenuFor(null);
        }}
        onRemove={() => menuFor && confirmRemove(menuFor)}
      />
    </Screen>
  );
}

function DeviceRow({
  device,
  editing,
  busy,
  notice,
  onOpen,
  onMenu,
  onSubmitName,
  onCancelEdit,
}: {
  device: DeviceSummary;
  editing: boolean;
  busy: boolean;
  notice: string | null;
  onOpen: () => void;
  onMenu: () => void;
  onSubmitName: (name: string) => void;
  onCancelEdit: () => void;
}) {
  const { colors } = useTheme();
  const online = device.status === 'online';
  // A self-claimed node has no name until someone gives it one; the server
  // echoes the hardware id in its place. Shown, but dimmed, so it reads as
  // "not yet named" rather than as a name.
  const unnamed = device.name === device.id;

  const meta = [
    online ? 'Online' : `Offline · seen ${formatAge(device.last_seen)}`,
    device.firmware_version ? `v${device.firmware_version}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (editing) {
    return <NameEditor device={device} onSubmit={onSubmitName} onCancel={onCancelEdit} />;
  }

  return (
    <View style={busy ? styles.busy : undefined}>
      <View style={styles.row}>
        <Pressable onPress={onOpen} accessibilityRole="button" style={styles.rowMain}>
          <StatusDot tone={online ? 'ok' : 'offline'} />
          <View style={styles.rowText}>
            <Text variant="body" color={unnamed ? 'mutedForeground' : 'foreground'} numeric={unnamed}>
              {device.name}
            </Text>
            <Text variant="caption" color="mutedForeground" numeric>
              {meta}
            </Text>
          </View>
          <CaretRight size={18} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={onMenu}
          hitSlop={10}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${device.name}`}
        >
          <DotsThreeVertical size={22} color={colors.mutedForeground} weight="bold" />
        </Pressable>
      </View>
      {!!notice && (
        <Text variant="caption" color="crit" style={styles.notice}>
          {notice}
        </Text>
      )}
    </View>
  );
}

/** Mounted only while a row is being renamed, so the draft always starts from the current name. */
function NameEditor({
  device,
  onSubmit,
  onCancel,
}: {
  device: DeviceSummary;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(device.name === device.id ? '' : device.name);

  return (
    <View style={styles.row}>
      <StatusDot tone={device.status === 'online' ? 'ok' : 'offline'} />
      <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => onSubmit(draft)}
          placeholder={device.id}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          returnKeyType="done"
          maxLength={255}
          style={[styles.input, typeScale.body, { color: colors.foreground }]}
          accessibilityLabel="Device name"
        />
      </View>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
        <Text variant="caption" color="mutedForeground">
          Cancel
        </Text>
      </Pressable>
      <Pressable onPress={() => onSubmit(draft)} hitSlop={8} accessibilityRole="button">
        <Text variant="heading" color="primary">
          Save
        </Text>
      </Pressable>
    </View>
  );
}

/** Bottom sheet with the row's management actions. A plain Modal: two rows do not need a library. */
function ActionSheet({
  device,
  onClose,
  onRename,
  onRemove,
}: {
  device: DeviceSummary | null;
  onClose: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={!!device} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View />
      </Pressable>
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text variant="caption" color="mutedForeground" style={styles.sheetTitle}>
          {device?.name}
        </Text>
        <Pressable onPress={onRename} accessibilityRole="button" style={styles.sheetRow}>
          <Text variant="body">Rename</Text>
        </Pressable>
        <Divider />
        <Pressable onPress={onRemove} accessibilityRole="button" style={styles.sheetRow}>
          <Text variant="body" color="crit">
            Remove device
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: space.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space.md },
  rowText: { flex: 1, gap: 2 },
  busy: { opacity: 0.5 },
  notice: { paddingBottom: space.sm },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  inputWrap: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingHorizontal: space.md,
  },
  input: { paddingVertical: space.sm },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.xxl,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  sheetTitle: { paddingBottom: space.xs },
  sheetRow: { paddingVertical: space.lg },
});
