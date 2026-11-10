import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CaretDown, CaretUp, FloppyDisk, Gauge, Ruler, WarningCircle } from '@phosphor-icons/react';
import TankDiagram from './TankDiagram';

import type { TankProfile } from '@aquamind/contracts';

export type TankProfileDto = TankProfile;

type Step = 'shape' | 'parallel' | 'dimensions' | 'summary';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'shape', label: 'Shape' },
  { key: 'parallel', label: 'Units' },
  { key: 'dimensions', label: 'Size' },
  { key: 'summary', label: 'Review' },
];

interface FormState {
  shape: 'cylindrical' | 'cuboidal' | null;
  parallelUnitCount: number;
  heightCm: string;
  diameterCm: string;
  lengthCm: string;
  widthCm: string;
  sensorOffsetCm: string;
  deadZoneCm: string;
  /** Blank = not measured. */
  fullDistanceCm: string;
}

function initialFormState(initialData?: TankProfileDto | null): FormState {
  if (!initialData) {
    return {
      shape: null,
      parallelUnitCount: 1,
      heightCm: '',
      diameterCm: '',
      lengthCm: '',
      widthCm: '',
      sensorOffsetCm: '0',
      deadZoneCm: '25',
      fullDistanceCm: '',
    };
  }
  return {
    shape: initialData.shape,
    parallelUnitCount: initialData.parallel_unit_count,
    heightCm: String(initialData.height_cm),
    diameterCm: initialData.diameter_cm != null ? String(initialData.diameter_cm) : '',
    lengthCm: initialData.length_cm != null ? String(initialData.length_cm) : '',
    widthCm: initialData.width_cm != null ? String(initialData.width_cm) : '',
    sensorOffsetCm: String(initialData.sensor_offset_cm),
    deadZoneCm: initialData.dead_zone_cm != null ? String(initialData.dead_zone_cm) : '25',
    fullDistanceCm: initialData.full_distance_cm != null ? String(initialData.full_distance_cm) : '',
  };
}

/** Litres in one tank filled to the brim. */
function computeUnitCapacityL(form: FormState): number {
  const height = Number(form.heightCm) || 0;
  if (form.shape === 'cylindrical') {
    const radius = (Number(form.diameterCm) || 0) / 2;
    return (Math.PI * radius * radius * height) / 1000;
  }
  return ((Number(form.lengthCm) || 0) * (Number(form.widthCm) || 0) * height) / 1000;
}

export function TankSetupWizard({
  deviceId,
  initialData,
  onComplete,
  onSkip,
  variant = 'page',
}: {
  deviceId: string;
  initialData?: TankProfileDto | null;
  /**
   * 'panel' is for a narrow host that already has its own title and frame,
   * such as the device page's side sheet: one column, no second heading, and
   * a one-line summary in place of the three boxes.
   */
  variant?: 'page' | 'panel';
  onComplete: () => void;
  onSkip?: () => void;
}) {
  const [step, setStep] = useState<Step>('shape');
  const [form, setForm] = useState<FormState>(() => initialFormState(initialData));
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const panel = variant === 'panel';
  const brimCapacityL = computeUnitCapacityL(form) * form.parallelUnitCount;
  const activeStepIndex = STEPS.findIndex((item) => item.key === step);

  // The same three distances the server works from (backend-v2/src/lib/tank-level.ts):
  // where the sensor reads empty, where it reads full, and the nearest it can see.
  const heightCm = Number(form.heightCm) || 0;
  const sensorOffsetCm = Number(form.sensorOffsetCm) || 0;
  const deadZoneCm = Number(form.deadZoneCm) || 0;
  const fullDistanceCm = form.fullDistanceCm.trim() === '' ? null : Number(form.fullDistanceCm);
  const emptyCm = heightCm + sensorOffsetCm;
  const fullCm = fullDistanceCm ?? Math.max(sensorOffsetCm, deadZoneCm);
  // Litres at 100%: what the dashboard will call the tank's capacity.
  const totalCapacityL =
    heightCm > 0 ? Math.max(0, emptyCm - fullCm) * (brimCapacityL / heightCm) : 0;
  // The tank fills closer to the sensor than the sensor can see.
  const shortfallCm =
    fullDistanceCm != null && fullDistanceCm < deadZoneCm ? deadZoneCm - fullDistanceCm : null;
  const sensorProblem =
    heightCm <= 0
      ? null
      : fullDistanceCm != null && (Number.isNaN(fullDistanceCm) || fullDistanceCm < 0)
        ? 'The distance to the water when full must be zero or more.'
        : emptyCm <= Math.max(fullCm, deadZoneCm)
          ? 'With these numbers the sensor cannot see any of the tank. Check the tank height and the sensor distances.'
          : null;

  const canProceedFromDimensions =
    heightCm > 0 &&
    !sensorProblem &&
    (form.shape === 'cylindrical'
      ? Number(form.diameterCm) > 0
      : Number(form.lengthCm) > 0 && Number(form.widthCm) > 0);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/v1/user/devices/${deviceId}/tank-profile`, {
        shape: form.shape,
        parallel_unit_count: form.parallelUnitCount,
        height_cm: Number(form.heightCm),
        diameter_cm: form.shape === 'cylindrical' ? Number(form.diameterCm) : null,
        length_cm: form.shape === 'cuboidal' ? Number(form.lengthCm) : null,
        width_cm: form.shape === 'cuboidal' ? Number(form.widthCm) : null,
        nominal_unit_volume_l: null,
        sensor_offset_cm: sensorOffsetCm,
        dead_zone_cm: deadZoneCm,
        full_distance_cm: fullDistanceCm,
      });
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save tank setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={
        panel ? 'space-y-4' : 'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'
      }
    >
      <div className={panel ? '' : 'border-b border-slate-100 px-4 py-3'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {!panel && (
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-cyan-100 p-2 text-cyan-700">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Tank calibration
                </h2>
                <p className="text-sm text-slate-500">
                  Capture shape and size so dashboard readings map to real capacity.
                </p>
              </div>
            </div>
          )}
          <ol
            aria-label="Setup steps"
            className={`grid shrink-0 grid-cols-4 gap-1 rounded-md bg-slate-100 p-1 ${panel ? 'w-full' : ''}`}
          >
            {STEPS.map((item, index) => (
              <li
                key={item.key}
                aria-current={index === activeStepIndex ? 'step' : undefined}
                className={`whitespace-nowrap rounded px-2 py-1 text-center text-xs font-semibold ${
                  index === activeStepIndex ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
                }`}
              >
                {item.label}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className={panel ? 'space-y-4' : 'grid gap-0 md:grid-cols-[0.9fr_1.1fr]'}>
        {panel ? (
          <div className="flex items-center gap-4 rounded-lg bg-surface-sunk px-4 py-3 ring-1 ring-hairline">
            <TankDiagram
              shape={form.shape}
              unitCount={form.parallelUnitCount}
              fillPercent={step === 'summary' ? 62 : null}
              className="h-20 w-28 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-1">
                <span className="capitalize">{form.shape || 'Shape not chosen'}</span>
                {form.shape && form.parallelUnitCount > 1 ? ` · ${form.parallelUnitCount} tanks` : ''}
              </p>
              <p className="tnum text-sm text-ink-3">
                {totalCapacityL > 0
                  ? `${Math.round(totalCapacityL).toLocaleString()} L when full`
                  : 'Capacity appears once the size is in'}
              </p>
            </div>
          </div>
        ) : (
          <div className="border-b border-slate-100 bg-surface p-4 text-ink-1 md:border-b-0 md:border-r">
            <div className="flex h-full min-h-72 flex-col justify-between gap-4">
              <div className="flex items-center justify-center rounded-lg bg-surface px-4 py-5">
                <TankDiagram
                  shape={form.shape}
                  unitCount={form.parallelUnitCount}
                  fillPercent={step === 'summary' ? 62 : null}
                  className="h-44 max-w-full"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0 rounded-md bg-surface-sunk px-3 py-2 ring-1 ring-hairline">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Shape</p>
                  <p className="mt-1 truncate text-sm font-semibold capitalize">
                    {form.shape || 'Unset'}
                  </p>
                </div>
                <div className="min-w-0 rounded-md bg-surface-sunk px-3 py-2 ring-1 ring-hairline">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Units</p>
                  <p className="mt-1 text-sm font-semibold">{form.parallelUnitCount}</p>
                </div>
                <div className="min-w-0 rounded-md bg-surface-sunk px-3 py-2 ring-1 ring-hairline">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
                    Capacity
                  </p>
                  <p className="tnum mt-1 truncate text-sm font-semibold">
                    {totalCapacityL > 0 ? `${totalCapacityL.toFixed(0)}L` : 'Pending'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`flex min-w-0 flex-col gap-4 ${panel ? '' : 'p-4'}`}>
          {error && (
            <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <div className="flex items-start gap-3">
                <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {step === 'shape' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">What shape is your tank?</p>
                <p className="text-sm text-slate-500">Choose the closest physical layout.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    shape: 'cylindrical' as const,
                    label: 'Plastic household tank',
                  },
                  { shape: 'cuboidal' as const, label: 'Cuboidal / sump tank' },
                ].map((option) => {
                  return (
                    <button
                      key={option.shape}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, shape: option.shape }))}
                      className={`flex min-h-28 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors ${
                        form.shape === option.shape
                          ? 'border-brand bg-brand-wash text-brand'
                          : 'border-slate-200 hover:border-brand'
                      }`}
                    >
                      <TankDiagram shape={option.shape} className="h-20" />
                      <span className="text-sm font-semibold">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button className="w-full" disabled={!form.shape} onClick={() => setStep('parallel')}>
                Next
              </Button>
            </div>
          )}

          {step === 'parallel' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Connected tank units</p>
                <p className="text-sm text-slate-500">
                  Count identical tanks plumbed together so they fill and drain as one.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={form.parallelUnitCount === 1 ? 'primary' : 'secondary'}
                  onClick={() => setForm((f) => ({ ...f, parallelUnitCount: 1 }))}
                >
                  No, just one
                </Button>
                <Button
                  type="button"
                  variant={form.parallelUnitCount > 1 ? 'primary' : 'secondary'}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      parallelUnitCount: f.parallelUnitCount > 1 ? f.parallelUnitCount : 2,
                    }))
                  }
                >
                  Yes, multiple
                </Button>
              </div>
              {form.parallelUnitCount > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="unit-count">How many tanks?</Label>
                  <Input
                    id="unit-count"
                    type="number"
                    min={2}
                    max={6}
                    value={form.parallelUnitCount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        parallelUnitCount: Math.min(6, Math.max(2, Number(e.target.value) || 2)),
                      }))
                    }
                  />
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setStep('shape')}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep('dimensions')}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'dimensions' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="height-cm">Total tank height (cm)</Label>
                <Input
                  id="height-cm"
                  type="number"
                  min={1}
                  placeholder="e.g. 120"
                  value={form.heightCm}
                  onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
                />
              </div>

              {form.shape === 'cylindrical' ? (
                <div className="space-y-2">
                  <Label htmlFor="diameter-cm">Diameter (cm)</Label>
                  <Input
                    id="diameter-cm"
                    type="number"
                    min={1}
                    placeholder="e.g. 90"
                    value={form.diameterCm}
                    onChange={(e) => setForm((f) => ({ ...f, diameterCm: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="length-cm">Length (cm)</Label>
                    <Input
                      id="length-cm"
                      type="number"
                      min={1}
                      placeholder="e.g. 100"
                      value={form.lengthCm}
                      onChange={(e) => setForm((f) => ({ ...f, lengthCm: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="width-cm">Width (cm)</Label>
                    <Input
                      id="width-cm"
                      type="number"
                      min={1}
                      placeholder="e.g. 80"
                      value={form.widthCm}
                      onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  Sensor position
                  {showAdvanced ? (
                    <CaretUp className="h-3 w-3" />
                  ) : (
                    <CaretDown className="h-3 w-3" />
                  )}
                </button>
                {showAdvanced && (
                  <div className={panel ? 'mt-3 space-y-4' : 'mt-2 space-y-4 rounded-lg border border-slate-200 p-3'}>
                    <div className="space-y-2">
                      <Label htmlFor="sensor-offset-cm">Sensor height above the tank top (cm)</Label>
                      <p className="text-xs text-muted-foreground">
                        How far the sensor face sits above the top of the tank. Use a negative
                        number if it hangs inside the tank, for example -5.
                      </p>
                      <Input
                        id="sensor-offset-cm"
                        type="number"
                        placeholder="0"
                        value={form.sensorOffsetCm}
                        onChange={(e) => setForm((f) => ({ ...f, sensorOffsetCm: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full-distance-cm">Distance to the water when full (cm)</Label>
                      <p className="text-xs text-muted-foreground">
                        With the tank full, measure from the sensor face down to the water. Leave
                        blank if you haven't measured it.
                      </p>
                      <Input
                        id="full-distance-cm"
                        type="number"
                        min={0}
                        placeholder="Not measured"
                        value={form.fullDistanceCm}
                        onChange={(e) => setForm((f) => ({ ...f, fullDistanceCm: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dead-zone-cm">Nearest distance the sensor can measure (cm)</Label>
                      <p className="text-xs text-muted-foreground">
                        Closer than this, the sensor cannot see the water. About 25 cm for the
                        JSN-SR04T sensor.
                      </p>
                      <Input
                        id="dead-zone-cm"
                        type="number"
                        min={0}
                        placeholder="25"
                        value={form.deadZoneCm}
                        onChange={(e) => setForm((f) => ({ ...f, deadZoneCm: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {sensorProblem && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm leading-relaxed">{sensorProblem}</p>
                </div>
              )}
              {!sensorProblem && shortfallCm != null && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm leading-relaxed">
                    When full, the water is {fullDistanceCm} cm from the sensor, closer than the{' '}
                    {deadZoneCm} cm it can measure. Readings near the top will be wrong. Raise the
                    sensor by at least {Math.ceil(shortfallCm)} cm, or lower the full level by the
                    same amount.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setStep('parallel')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!canProceedFromDimensions}
                  onClick={() => setStep('summary')}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Capacity when full
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {totalCapacityL.toFixed(0)}L
                    </p>
                  </div>
                  <Ruler className="h-5 w-5 text-cyan-600" />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {form.parallelUnitCount > 1
                    ? `${form.parallelUnitCount} × ${(totalCapacityL / form.parallelUnitCount).toFixed(0)}L tanks, `
                    : ''}
                  {form.heightCm}cm tall
                </p>
                {brimCapacityL - totalCapacityL >= 1 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Filled to the brim it would hold {brimCapacityL.toFixed(0)}L.{' '}
                    {fullDistanceCm != null
                      ? 'The figure above is what it holds at its full level.'
                      : 'The figure above is the part the sensor can measure. Add the distance to the water when full for an exact figure.'}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setStep('dimensions')}
                >
                  Back
                </Button>
                <Button className="flex-1" onClick={save} disabled={saving}>
                  {!saving && <FloppyDisk className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {onSkip && step === 'shape' && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={onSkip}
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
