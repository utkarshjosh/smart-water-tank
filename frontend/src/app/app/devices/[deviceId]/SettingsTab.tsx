import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deviceKeys,
  useDevice,
  useDeviceConfig,
  useFirmwareStatus,
  type ConfigDto,
  type DeviceInfo,
} from './useDevice';

export default function SettingsTab() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const device = useDevice(deviceId);
  const config = useDeviceConfig(deviceId);
  const firmware = useFirmwareStatus(deviceId);

  const [low, setLow] = useState('');
  const [full, setFull] = useState('');
  const [name, setName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);

  // A device paired through the self-claim flow arrives with no name, so the
  // API echoes the hardware ID back as the name. Treat that as "unnamed" so
  // the field starts empty rather than pre-filled with a hardware ID.
  useEffect(() => {
    if (!device.data || nameDirty) return;
    setName(device.data.name === device.data.id ? '' : device.data.name);
  }, [device.data, nameDirty]);

  useEffect(() => {
    if (!config.data) return;
    setLow(
      config.data.tank_low_threshold_pct != null ? String(config.data.tank_low_threshold_pct) : ''
    );
    setFull(
      config.data.tank_full_threshold_pct != null ? String(config.data.tank_full_threshold_pct) : ''
    );
  }, [config.data]);

  const rename = useMutation({
    mutationFn: () =>
      api
        .put<DeviceInfo>(`/api/v1/user/devices/${deviceId}`, { name: name.trim() || null })
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(deviceKeys.info(deviceId), data);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setNameDirty(false);
      toast.success(name.trim() ? 'Device renamed' : 'Name cleared');
    },
    onError: () => toast.error("Couldn't rename this device", { description: 'Please try again.' }),
  });

  const save = useMutation({
    mutationFn: () =>
      api
        .put<ConfigDto>(`/api/v1/user/devices/${deviceId}/alert-thresholds`, {
          ...(low !== '' ? { tank_low_threshold_pct: Number(low) } : {}),
          ...(full !== '' ? { tank_full_threshold_pct: Number(full) } : {}),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(deviceKeys.config(deviceId), data);
      toast.success('Thresholds saved');
    },
    onError: () => toast.error("Couldn't save thresholds", { description: 'Please try again.' }),
  });

  const invalid =
    (low !== '' && (Number(low) < 0 || Number(low) > 100)) ||
    (full !== '' && (Number(full) < 0 || Number(full) > 100)) ||
    (low !== '' && full !== '' && Number(low) >= Number(full));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>
            What this tank is called across the app. Leave it empty to fall back to the hardware ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="device-name">Device name</Label>
            <Input
              id="device-name"
              value={name}
              placeholder={device.data?.id ?? 'Roof tank'}
              onChange={(e) => {
                setName(e.target.value);
                setNameDirty(true);
              }}
              maxLength={255}
            />
          </div>
          <Button onClick={() => rename.mutate()} loading={rename.isPending} disabled={!nameDirty}>
            Save name
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert thresholds</CardTitle>
          <CardDescription>Get notified when the level crosses these bounds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="low-pct">Low level (%)</Label>
              <Input
                id="low-pct"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={low}
                onChange={(e) => setLow(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full-pct">Full level (%)</Label>
              <Input
                id="full-pct"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={full}
                onChange={(e) => setFull(e.target.value)}
              />
            </div>
          </div>
          {invalid && (
            <p className="text-caption text-critical-text">
              Use values between 0 and 100, with the low threshold below the full one.
            </p>
          )}
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={invalid}>
            Save thresholds
          </Button>
          {config.data && (
            <p className="text-caption text-ink-3">
              Measures every {Math.round(config.data.measurement_interval_ms / 1000)}s, reports
              every {Math.round(config.data.report_interval_ms / 1000)}s.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device &amp; firmware</CardTitle>
        </CardHeader>
        <CardContent>
          {device.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Device ID" value={device.data?.id} mono />
              <Field
                label="Last seen"
                value={
                  device.data?.last_seen
                    ? new Date(device.data.last_seen).toLocaleString()
                    : 'Never'
                }
              />
              <Field
                label="Current firmware"
                value={firmware.data?.current_version || device.data?.firmware_version || 'Unknown'}
              />
              <Field
                label="Latest available"
                value={firmware.data?.latest_known_version || 'Unknown'}
              />
              <div className="col-span-2">
                <dt className="text-caption font-medium text-ink-3">Updates</dt>
                <dd className="mt-1 text-body text-ink-2">
                  Checked automatically
                  {firmware.data?.last_checked_at
                    ? `, last checked ${new Date(firmware.data.last_checked_at).toLocaleString()}`
                    : ''}
                  .
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-ink-3">{label}</dt>
      <dd className={`mt-1 truncate text-body text-ink-1 ${mono ? 'font-mono text-caption' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
