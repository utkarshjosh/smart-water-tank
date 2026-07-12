import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Boxes, ChevronDown, ChevronUp, Cylinder, Gauge, Ruler, Save } from 'lucide-react';
import TankDiagram from './TankDiagram';

export interface TankProfileDto {
  shape: 'cylindrical' | 'cuboidal';
  parallel_unit_count: number;
  height_cm: number;
  diameter_cm: number | null;
  length_cm: number | null;
  width_cm: number | null;
  nominal_unit_volume_l: number | null;
  sensor_offset_cm: number;
  dead_zone_cm: number;
  unit_capacity_l: number;
  total_capacity_l: number;
}

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
      deadZoneCm: '20',
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
    deadZoneCm: initialData.dead_zone_cm != null ? String(initialData.dead_zone_cm) : '20',
  };
}

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
}: {
  deviceId: string;
  initialData?: TankProfileDto | null;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  const [step, setStep] = useState<Step>('shape');
  const [form, setForm] = useState<FormState>(() => initialFormState(initialData));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalCapacityL = computeUnitCapacityL(form) * form.parallelUnitCount;
  const activeStepIndex = STEPS.findIndex((item) => item.key === step);

  const canProceedFromDimensions =
    Number(form.heightCm) > 0 &&
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
        sensor_offset_cm: Number(form.sensorOffsetCm) || 0,
        dead_zone_cm: Number(form.deadZoneCm) || 0,
      });
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save tank setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Tank calibration</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Capture shape and size so dashboard readings map to real capacity.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {STEPS.map((item, index) => (
              <span
                key={item.key}
                className={`rounded px-2 py-1 text-center text-xs font-semibold ${
                  index === activeStepIndex
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-slate-100 bg-slate-950 p-4 text-slate-100 dark:border-slate-800 md:border-b-0 md:border-r">
          <div className="flex h-full min-h-72 flex-col justify-between gap-4">
            <div className="flex items-center justify-center rounded-lg bg-white/5 px-4 py-5 ring-1 ring-white/10">
              <TankDiagram
                shape={form.shape}
                unitCount={form.parallelUnitCount}
                fillPercent={step === 'summary' ? 62 : null}
                className="h-44 max-w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Shape</p>
                <p className="mt-1 truncate text-sm font-semibold capitalize">{form.shape || 'Unset'}</p>
              </div>
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Units</p>
                <p className="mt-1 text-sm font-semibold">{form.parallelUnitCount}</p>
              </div>
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Capacity</p>
                <p className="mt-1 truncate text-sm font-semibold">{totalCapacityL > 0 ? `${totalCapacityL.toFixed(0)}L` : 'Pending'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4">
        {error && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {step === 'shape' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">What shape is your tank?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Choose the closest physical layout.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { shape: 'cylindrical' as const, label: 'Plastic household tank', icon: Cylinder },
                  { shape: 'cuboidal' as const, label: 'Cuboidal / sump tank', icon: Boxes },
                ]
              ).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.shape}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, shape: option.shape }))}
                    className={`flex min-h-28 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors ${
                      form.shape === option.shape
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-950 dark:bg-cyan-500/10 dark:text-cyan-100'
                        : 'border-slate-200 hover:border-cyan-300 dark:border-slate-800 dark:hover:border-cyan-600'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
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
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Connected tank units</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Count identical tanks plumbed together so they fill and drain as one.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={form.parallelUnitCount === 1 ? 'default' : 'outline'}
                onClick={() => setForm((f) => ({ ...f, parallelUnitCount: 1 }))}
              >
                No, just one
              </Button>
              <Button
                type="button"
                variant={form.parallelUnitCount > 1 ? 'default' : 'outline'}
                onClick={() => setForm((f) => ({ ...f, parallelUnitCount: f.parallelUnitCount > 1 ? f.parallelUnitCount : 2 }))}
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
                    setForm((f) => ({ ...f, parallelUnitCount: Math.min(6, Math.max(2, Number(e.target.value) || 2)) }))
                  }
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="w-full" onClick={() => setStep('shape')}>
                Back
              </Button>
              <Button className="w-full" onClick={() => setStep('dimensions')}>
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
                Advanced: sensor calibration
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="space-y-2">
                    <Label htmlFor="sensor-offset-cm">Sensor mounting offset (cm)</Label>
                    <p className="text-xs text-muted-foreground">
                      How far below the tank's rim is the sensor mounted? Leave as 0 unless your sensor sits noticeably
                      below the rim.
                    </p>
                    <Input
                      id="sensor-offset-cm"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={form.sensorOffsetCm}
                      onChange={(e) => setForm((f) => ({ ...f, sensorOffsetCm: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dead-zone-cm">Sensor dead zone (cm)</Label>
                    <p className="text-xs text-muted-foreground">
                      Minimum distance the ultrasonic sensor can measure. Water closer than this reads as full. Most
                      SR04-style sensors are ~20-25cm.
                    </p>
                    <Input
                      id="dead-zone-cm"
                      type="number"
                      min={0}
                      placeholder="20"
                      value={form.deadZoneCm}
                      onChange={(e) => setForm((f) => ({ ...f, deadZoneCm: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="w-full" onClick={() => setStep('parallel')}>
                Back
              </Button>
              <Button className="w-full" disabled={!canProceedFromDimensions} onClick={() => setStep('summary')}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 'summary' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total capacity</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{totalCapacityL.toFixed(0)}L</p>
                </div>
                <Ruler className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {form.parallelUnitCount > 1
                  ? `${form.parallelUnitCount} × ${(totalCapacityL / form.parallelUnitCount).toFixed(0)}L tanks, `
                  : ''}
                {form.heightCm}cm tall
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="w-full" onClick={() => setStep('dimensions')}>
                Back
              </Button>
              <Button className="w-full" onClick={save} disabled={saving}>
                {!saving && <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {onSkip && step === 'shape' && (
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onSkip}>
            Skip for now
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
