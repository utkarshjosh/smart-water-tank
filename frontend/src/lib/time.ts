/** "Just now" / "12m ago" / "3h ago", falling back to a date past two days. */
export function relativeTime(value: string | null | undefined, neverLabel = 'Never'): string {
  if (!value) return neverLabel;

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown';

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  return new Date(value).toLocaleDateString();
}

/** Sort key for a timestamp: newest first when sorted descending. */
export const timeSortValue = (value: string | null | undefined) =>
  value ? new Date(value).getTime() || null : null;
