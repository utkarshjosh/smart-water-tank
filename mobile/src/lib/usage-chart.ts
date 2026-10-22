/**
 * The rules of the usage bar chart, shared with the webapp's UsageBarChart
 * (frontend/src/components/charts/UsageBarChart.tsx). Pure, so they are
 * tested; the React Native component only draws what this returns.
 *
 * - Water used goes above the baseline and water added below it, on ONE
 *   scale: the height splits in proportion to the biggest use and the
 *   biggest fill, so 100 L is the same height on both sides.
 * - When fills dwarf use (more than MARKER_RATIO times the biggest use, e.g.
 *   an hour with a 380 L refill beside 20-90 L of use), fills stop being bars
 *   and become "+N" markers under the slots they ran in, consecutive slots
 *   merged. The green bars keep the full height instead of shrinking.
 * - A slot with no readings has usedL null and is drawn dashed: no data must
 *   never look like no use.
 */

export interface UsageSlot {
  key: string;
  /** Short axis label, e.g. "1 PM" or "Mon". */
  tick: string;
  /** Full label for the detail line, e.g. "1 PM – 2 PM". */
  title: string;
  usedL: number | null;
  /** Omit for charts that don't track fills. */
  filledL?: number | null;
  /** Extra words for the detail line, e.g. "filled 2×". */
  note?: string;
  /** Draw this slot's used bar in the alert colour. */
  alert?: boolean;
}

export const MARKER_RATIO = 2.5;

export type ChartLayout = 'used-only' | 'shared' | 'markers';

export interface ChartGeometry {
  layout: ChartLayout;
  maxUp: number;
  maxDown: number;
  /** Heights in px for the used and added halves of the plot. */
  upHeight: number;
  downHeight: number;
}

export function chartGeometry(slots: UsageSlot[], height: number, showFills = true): ChartGeometry {
  const maxUp = Math.max(1, ...slots.map((s) => s.usedL ?? 0));
  const maxDown = Math.max(1, ...slots.map((s) => s.filledL ?? 0));
  const hasFills = showFills && slots.some((s) => (s.filledL ?? 0) > 0);
  const layout: ChartLayout = !hasFills ? 'used-only' : maxDown / maxUp > MARKER_RATIO ? 'markers' : 'shared';
  const upHeight = layout === 'shared' ? (height * maxUp) / (maxUp + maxDown) : height;
  return { layout, maxUp, maxDown, upHeight, downHeight: height - upHeight };
}

/** Runs of consecutive slots with water added: one fill, one marker. */
export function fillRuns(slots: UsageSlot[]): { from: number; to: number; litres: number }[] {
  const runs: { from: number; to: number; litres: number }[] = [];
  slots.forEach((s, i) => {
    const litres = s.filledL ?? 0;
    if (litres <= 0) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) {
      last.to = i;
      last.litres += litres;
    } else runs.push({ from: i, to: i, litres });
  });
  return runs;
}

/**
 * Which bars carry their number: bars at least a fifth of the tallest, and
 * past 24 slots (a month of days) only the tallest. The selected bar always
 * shows its number; that's decided at draw time.
 */
export function showsNumber(fraction: number, slotCount: number): boolean {
  return fraction >= (slotCount > 24 ? 1 : 0.2);
}

/** The slot selected before the user taps one: the latest with readings. */
export function defaultSelection(slots: UsageSlot[]): number {
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i].usedL != null) return i;
  return slots.length - 1;
}

/** The line under the chart: "7 AM – 8 AM · 92 L used · 380 L added". */
export function detailText(slot: UsageSlot, withFills: boolean, litres: (v: number) => string): string {
  if (slot.usedL == null) return `${slot.title} · no readings`;
  const parts = [slot.title, `${litres(slot.usedL)} used`];
  if (withFills && slot.filledL) parts.push(`${litres(slot.filledL)} added`);
  if (slot.note) parts.push(slot.note);
  return parts.join(' · ');
}
