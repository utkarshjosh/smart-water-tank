import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  waterChartModel,
  preferredWaterMetric,
  type WaterChartSlot,
  type WaterChartMetric,
} from '@aquamind/contracts';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatLitres } from '@/lib/usage-format';
import './water-chart.css';

export type UsageSlot = WaterChartSlot;

/** A single, labelled ruler. Used water and refills each get a clear view. */
export function UsageBarChart({
  slots,
  height = 170,
  ariaLabel,
  showFills = true,
  tickEvery,
}: {
  slots: UsageSlot[];
  height?: number;
  ariaLabel: string;
  showFills?: boolean;
  tickEvery?: number;
}) {
  const [choice, setChoice] = useState<WaterChartMetric | null>(null);
  const metric = showFills ? (choice ?? preferredWaterMetric(slots)) : 'used';
  const model = waterChartModel(slots, metric);
  const slotsKey = slots.map((s) => s.key).join('|');
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const picked = selection?.key === slotsKey;
  const active =
    picked
      ? Math.min(selection.index, slots.length - 1)
      : model.peak >= 0
        ? model.peak
        : model.latest;
  const current = slots[active];
  const amount = model.values[active];
  const plot = useRef<HTMLDivElement>(null);
  const select = (index: number) => setSelection({ key: slotsKey, index });
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (box?.width)
      select(
        Math.min(
          slots.length - 1,
          Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * slots.length))
        )
      );
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') select(Math.max(0, active - 1));
    else if (e.key === 'ArrowRight') select(Math.min(slots.length - 1, active + 1));
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(slots.length - 1);
    else return;
    e.preventDefault();
  };
  if (!slots.length) return <p className="water-chart-empty">Waiting for your first readings.</p>;
  const every = tickEvery ?? Math.max(1, Math.ceil(slots.length / 5));
  const unit = metric === 'used' ? 'used' : 'added';
  const detail = current
    ? `${current.title} · ${amount == null ? 'No readings' : `${formatLitres(amount)} ${unit}`}`
    : 'No readings in this period';
  return (
    <div className={`water-chart water-chart--${metric}`}>
      <div className="water-chart-toolbar">
        <span className="water-chart-unit">Litres {unit}</span>
        {showFills && (
          <SegmentedControl
            aria-label={`${ariaLabel}: measure`}
            value={metric}
            onChange={(metric) => {
              setChoice(metric);
              setSelection(null);
            }}
            options={[
              { value: 'used', label: 'Water used' },
              { value: 'filled', label: 'Refills' },
            ]}
          />
        )}
      </div>
      {model.recorded === 0 ? (
        <div className="water-chart-empty" style={{ minHeight: height }}>
          <span className="water-chart-empty-mark" aria-hidden>
            ···
          </span>
          <strong>No readings in this period</strong>
          <span>
            Usage will appear after the sensor reports. Missing readings do not mean zero use.
          </span>
        </div>
      ) : model.total === 0 ? (
        <div className="water-chart-zero" role="status">
          <strong>{metric === 'used' ? 'No measurable use recorded' : 'No refill recorded'}</strong>
          <span>During the periods with valid readings.</span>
        </div>
      ) : (
        <>
          <div className="water-chart-frame" style={{ height }}>
            <div className="water-chart-axis" aria-hidden>
              {[model.maximum, model.maximum / 2, 0].map((v) => (
                <span key={v}>{v.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              ))}
            </div>
            <div
              ref={plot}
              role="slider"
              tabIndex={0}
              aria-label={`${ariaLabel}: ${unit}`}
              aria-valuemin={0}
              aria-valuemax={slots.length - 1}
              aria-valuenow={Math.max(0, active)}
              aria-valuetext={detail}
              onPointerMove={pick}
              onPointerDown={pick}
              onKeyDown={onKey}
              className="water-chart-plot"
            >
              <div className="water-chart-grid" aria-hidden>
                <i />
                <i />
                <i />
              </div>
              {slots.map((s, i) => (
                <div
                  key={s.key}
                  className={`water-chart-column ${active === i ? 'is-active' : ''}`}
                  aria-hidden
                >
                  {model.values[i] == null ? (
                    <span className="water-chart-gap" />
                  ) : (
                    <span
                      className={`water-chart-bar ${s.alert && metric === 'used' ? 'is-alert' : ''}`}
                      style={{
                        height: `${Math.max(model.values[i]! > 0 ? 1.5 : 0.6, (model.values[i]! / model.maximum) * 100)}%`,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="water-chart-ticks" aria-hidden>
            {slots.map((s, i) => (
              <span key={s.key}>{i % every === 0 ? s.tick : ''}</span>
            ))}
          </div>
          <div className="water-chart-readout" aria-live="polite">
            <div>
              <span>{current?.title ?? 'Select a bar'}</span>
              <strong className="tnum">
                {amount == null ? 'No readings' : formatLitres(amount)}
                {amount != null && <small> {unit}</small>}
              </strong>
            </div>
            <span className="water-chart-hint">
              {current?.note || (picked ? '' : 'Highest shown. Hover or tap a bar to compare.')}
            </span>
          </div>
        </>
      )}
      {model.total !== 0 && model.recorded > 0 && model.recorded < slots.length && (
        <p className="water-chart-coverage">
          <i aria-hidden /> Gaps show hours or days without readings.
        </p>
      )}
    </div>
  );
}
