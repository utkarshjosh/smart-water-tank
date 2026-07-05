import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
  unit_capacity_l: number;
  total_capacity_l: number;
}

type Step = 'shape' | 'parallel' | 'dimensions' | 'summary';

const NOMINAL_SIZES = [500, 1000, 2000];

interface FormState {
  shape: 'cylindrical' | 'cuboidal' | null;
  parallelUnitCount: number;
  heightCm: string;
  diameterCm: string;
  lengthCm: string;
  widthCm: string;
  nominalUnitVolumeL: number | null;
  useExactDimensions: boolean;
  sensorOffsetCm: string;
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
      nominalUnitVolumeL: null,
      useExactDimensions: false,
      sensorOffsetCm: '0',
    };
  }
  return {
    shape: initialData.shape,
    parallelUnitCount: initialData.parallel_unit_count,
    heightCm: String(initialData.height_cm),
    diameterCm: initialData.diameter_cm != null ? String(initialData.diameter_cm) : '',
    lengthCm: initialData.length_cm != null ? String(initialData.length_cm) : '',
    widthCm: initialData.width_cm != null ? String(initialData.width_cm) : '',
    nominalUnitVolumeL: initialData.nominal_unit_volume_l,
    useExactDimensions: initialData.nominal_unit_volume_l == null,
    sensorOffsetCm: String(initialData.sensor_offset_cm),
  };
}

function computeUnitCapacityL(form: FormState): number {
  if (!form.useExactDimensions && form.nominalUnitVolumeL != null) return form.nominalUnitVolumeL;

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

  const canProceedFromDimensions =
    Number(form.heightCm) > 0 &&
    (form.useExactDimensions
      ? form.shape === 'cylindrical'
        ? Number(form.diameterCm) > 0
        : Number(form.lengthCm) > 0 && Number(form.widthCm) > 0
      : form.nominalUnitVolumeL != null);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/v1/user/devices/${deviceId}/tank-profile`, {
        shape: form.shape,
        parallel_unit_count: form.parallelUnitCount,
        height_cm: Number(form.heightCm),
        diameter_cm: form.shape === 'cylindrical' && form.useExactDimensions ? Number(form.diameterCm) : null,
        length_cm: form.shape === 'cuboidal' && form.useExactDimensions ? Number(form.lengthCm) : null,
        width_cm: form.shape === 'cuboidal' && form.useExactDimensions ? Number(form.widthCm) : null,
        nominal_unit_volume_l: form.useExactDimensions ? null : form.nominalUnitVolumeL,
        sensor_offset_cm: Number(form.sensorOffsetCm) || 0,
      });
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save tank setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border-2 border-border/80 bg-card shadow-xl">
      <div className="space-y-2 px-6 pb-0 pt-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Set up your tank</h2>
        <p className="text-sm text-muted-foreground">
          A few quick questions so we can show accurate levels and alerts for your tank.
        </p>
      </div>

      <div className="flex flex-col gap-6 p-6">
        {error && (
          <div className="w-full rounded-lg border border-destructive/50 bg-background p-4 text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        <div className="flex justify-center rounded-2xl bg-slate-950 p-4 text-slate-100">
          <TankDiagram
            shape={form.shape}
            unitCount={form.parallelUnitCount}
            fillPercent={step === 'summary' ? 62 : null}
            className="h-40"
          />
        </div>

        {step === 'shape' && (
          <div className="space-y-4">
            <p className="text-sm font-medium">What shape is your tank?</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { shape: 'cylindrical' as const, label: 'Plastic household tank' },
                  { shape: 'cuboidal' as const, label: 'Cuboidal / sump tank' },
                ]
              ).map((option) => (
                <button
                  key={option.shape}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, shape: option.shape }))}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-colors ${
                    form.shape === option.shape
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                      : 'border-border hover:border-sky-300'
                  }`}
                >
                  <TankDiagram shape={option.shape} unitCount={1} className="h-24 text-slate-500" />
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!form.shape} onClick={() => setStep('parallel')}>
              Next
            </Button>
          </div>
        )}

        {step === 'parallel' && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Are multiple identical tanks connected together?</p>
            <p className="text-xs text-muted-foreground">
              Common with plastic tanks plumbed side-by-side (e.g. two 500L tanks joined at the base) so they fill and
              drain together.
            </p>
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
          <div className="space-y-4">
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

            {!form.useExactDimensions && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pick your tank's nominal size</p>
                <div className="grid grid-cols-3 gap-2">
                  {NOMINAL_SIZES.map((size) => (
                    <Button
                      key={size}
                      type="button"
                      variant={form.nominalUnitVolumeL === size ? 'default' : 'outline'}
                      onClick={() => setForm((f) => ({ ...f, nominalUnitVolumeL: size }))}
                    >
                      {size}L
                    </Button>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  onClick={() => setForm((f) => ({ ...f, useExactDimensions: true }))}
                >
                  I'd rather enter exact dimensions
                </button>
              </div>
            )}

            {form.useExactDimensions && (
              <div className="space-y-4">
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
                        value={form.widthCm}
                        onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  onClick={() => setForm((f) => ({ ...f, useExactDimensions: false }))}
                >
                  Use a nominal size instead
                </button>
              </div>
            )}

            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                Advanced: sensor mounting offset
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    How far below the tank's rim is the sensor mounted? Leave as 0 unless your sensor sits noticeably
                    below the rim.
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={form.sensorOffsetCm}
                    onChange={(e) => setForm((f) => ({ ...f, sensorOffsetCm: e.target.value }))}
                  />
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
          <div className="space-y-4">
            <div className="rounded-2xl bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">Total capacity</p>
              <p className="text-3xl font-bold tracking-tight">{totalCapacityL.toFixed(0)}L</p>
              <p className="text-xs text-muted-foreground">
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
  );
}
