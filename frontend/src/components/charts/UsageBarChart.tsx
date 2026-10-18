import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatLitres } from '@/lib/usage-format';

/**
 * Litres per time slot as bars: water used above the baseline, water added
 * below it. Shared by the hourly and daily usage cards.
 *
 * Reading it should need no guessing:
 * - the larger bars carry their number;
 * - pointing at, tapping or arrow-keying to a slot selects it at once and the
 *   line under the chart spells it out ("1 PM - 2 PM · 86 L used · 120 L
 *   added"). No native tooltip: those appear after a delay and never on touch.
 * - a slot with no readings is drawn dashed, so "no data" never looks like
 *   "no use".
 *
 * Plain DOM, no chart library, so the Overview tab still doesn't load the
 * chart bundle.
 */

export interface UsageSlot {
  key: string;
  /** Short axis label, e.g. "1 PM" or "18". */
  tick: string;
  /** Full label for the detail line, e.g. "1 PM – 2 PM" or "Sat 18 Oct". */
  title: string;
  usedL: number | null;
  /** Omit for charts that don't track fills. */
  filledL?: number | null;
  /** Extra words for the detail line, e.g. "2 refills" or "leak suspected". */
  note?: string;
  /** Draw this slot's used bar in the alert colour. */
  alert?: boolean;
}

const UP_SHARE = 0.68; // of the plot height, when fills are shown

export function UsageBarChart({
  slots,
  height = 150,
  ariaLabel,
  showFills = true,
  tickEvery,
}: {
  slots: UsageSlot[];
  height?: number;
  ariaLabel: string;
  showFills?: boolean;
  /** Label every nth slot on the axis; default fits about six labels. */
  tickEvery?: number;
}) {
  const lastWithData = useMemo(() => {
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i].usedL != null) return i;
    return slots.length - 1;
  }, [slots]);
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? lastWithData;
  // A new window (Today vs 24h) means old indexes point at different slots.
  const slotsKey = slots.map((s) => s.key).join();
  useEffect(() => setSelected(null), [slotsKey]);

  const plot = useRef<HTMLDivElement>(null);
  const maxUp = Math.max(1, ...slots.map((s) => s.usedL ?? 0));
  const maxDown = Math.max(1, ...slots.map((s) => s.filledL ?? 0));
  const hasFills = showFills && slots.some((s) => (s.filledL ?? 0) > 0);
  const upHeight = hasFills ? height * UP_SHARE : height;
  const downHeight = hasFills ? height - upHeight : 0;
  const every = tickEvery ?? Math.max(1, Math.ceil(slots.length / 6));
  // Numbers only where they fit: on bars at least a fifth of the tallest, and
  // past 24 slots (a month of days) only on the tallest - plus, always, the
  // selected one.
  const labelFrom = slots.length > 24 ? 1 : 0.2;

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || slots.length === 0) return;
    const i = Math.floor(((event.clientX - box.left) / box.width) * slots.length);
    setSelected(Math.min(slots.length - 1, Math.max(0, i)));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setSelected(Math.max(0, active - 1));
    else if (event.key === 'ArrowRight') setSelected(Math.min(slots.length - 1, active + 1));
    else return;
    event.preventDefault();
  };

  if (slots.length === 0) return null;
  const current = slots[active];

  return (
    <div>
      <div
        ref={plot}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={slots.length - 1}
        aria-valuenow={active}
        aria-valuetext={current ? detailText(current, hasFills) : undefined}
        onPointerMove={pick}
        onPointerDown={pick}
        onKeyDown={onKey}
        className="relative cursor-crosshair touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        style={{ height: height + 14 }}
      >
        {/* Room above the tallest bar for its number. */}
        <div className="absolute inset-x-0 bottom-0 flex gap-[2px]" style={{ height }}>
          {slots.map((slot, i) => {
            const up = slot.usedL == null ? null : slot.usedL / maxUp;
            const down = (slot.filledL ?? 0) / maxDown;
            const isActive = i === active;
            return (
              <div key={slot.key} className="relative flex h-full flex-1 flex-col">
                {isActive && <div aria-hidden className="absolute inset-0 -mx-[1px] rounded-sm bg-ink-1/[0.05]" />}
                <div className="relative flex items-end" style={{ height: upHeight }}>
                  {up == null ? (
                    <div className="h-full w-full rounded-sm border border-dashed border-hairline" />
                  ) : (
                    <div
                      className={`relative w-full rounded-t-[3px] ${slot.alert ? 'bg-critical' : 'bg-series-volume'} ${
                        isActive ? '' : 'opacity-90'
                      }`}
                      style={{ height: `${Math.max(slot.usedL ? 2 : 1, up * 100)}%` }}
                    >
                      {(up >= labelFrom || isActive) && slot.usedL ? (
                        <span className="absolute inset-x-[-8px] -top-[15px] text-center text-[10px] leading-none text-ink-2 tnum">
                          {Math.round(slot.usedL)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                {hasFills && (
                  <div className="relative border-t border-hairline" style={{ height: downHeight }}>
                    {down > 0 && (
                      <div
                        className="relative w-full rounded-b-[3px] bg-brand"
                        style={{ height: `${Math.max(2, down * 82)}%` }}
                      >
                        {(down >= labelFrom || isActive) && (
                          <span className="absolute inset-x-[-8px] -bottom-[13px] text-center text-[10px] leading-none text-ink-2 tnum">
                            {Math.round(slot.filledL!)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] text-[11px] text-ink-3" aria-hidden>
        {slots.map((slot, i) => (
          <span key={slot.key} className="flex-1 overflow-visible whitespace-nowrap">
            {i % every === 0 ? slot.tick : ''}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-hairline pt-2.5">
        <p className="text-label text-ink-1" aria-live="polite">
          {current && detailText(current, hasFills)}
        </p>
        <span className="flex items-center gap-3 text-caption text-ink-3">
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-series-volume" /> Used
          </span>
          {hasFills && (
            <span className="flex items-center gap-1.5">
              <i aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" /> Added (tank filling)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function detailText(slot: UsageSlot, withFills: boolean): string {
  if (slot.usedL == null) return `${slot.title} · no readings`;
  const parts = [`${slot.title}`, `${formatLitres(slot.usedL)} used`];
  if (withFills && slot.filledL) parts.push(`${formatLitres(slot.filledL)} added`);
  if (slot.note) parts.push(slot.note);
  return parts.join(' · ');
}
