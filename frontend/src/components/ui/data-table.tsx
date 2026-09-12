import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Marks the column that titles the card in the mobile layout. */
  primary?: boolean;
  /** Dropped from the mobile card - noise on a phone. */
  desktopOnly?: boolean;
  align?: 'left' | 'right';
  width?: string;
}

type Direction = 'asc' | 'desc';

/**
 * One table for every admin list. A real <table> with a sticky header once
 * there is room; below md each row becomes a card, because a five-column table
 * on a 390px screen is either a horizontal scroll or unreadable text.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  loading,
  empty,
  initialSort,
  caption,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  initialSort?: { key: string; direction?: Direction };
  caption?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: Direction } | null>(
    initialSort ? { key: initialSort.key, direction: initialSort.direction ?? 'asc' } : null
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      // Missing values sort last in both directions rather than pretending to
      // be zero or an empty string.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );

  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return <div className={className}>{empty}</div>;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.desktopOnly);
  const sortable = columns.filter((c) => c.sortValue);

  return (
    <div className={className}>
      {/* Desktop: a table. */}
      <div className="hidden overflow-hidden rounded-lg border border-hairline bg-surface md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-left">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="sticky top-0 z-10 bg-surface-sunk">
              <tr>
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const Icon = !active
                    ? CaretUpDown
                    : sort.direction === 'asc'
                      ? CaretUp
                      : CaretDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      aria-sort={
                        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cn(
                        'whitespace-nowrap border-b border-hairline px-4 py-2.5 text-label text-ink-2',
                        column.align === 'right' && 'text-right'
                      )}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggle(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm transition-colors duration-instant hover:text-ink-1',
                            active && 'text-ink-1'
                          )}
                        >
                          {column.header}
                          <Icon size={13} aria-hidden />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-hairline last:border-0',
                    onRowClick &&
                      'cursor-pointer transition-colors duration-instant hover:bg-surface-hover'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-body text-ink-1',
                        column.align === 'right' && 'text-right'
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: the card layout has no column headers to click, so sorting
          gets its own control - otherwise the phone view is not sortable at
          all, which is half a feature. */}
      {sortable.length > 0 && (
        <div className="mb-2 flex items-center gap-2 md:hidden">
          <Select
            value={sort?.key ?? ''}
            onValueChange={(key) =>
              setSort({ key, direction: sort?.key === key ? sort.direction : 'asc' })
            }
          >
            <SelectTrigger className="h-9 flex-1" aria-label="Sort by">
              <SelectValue placeholder="Sort by…" />
            </SelectTrigger>
            <SelectContent>
              {sortable.map((column) => (
                <SelectItem key={column.key} value={column.key}>
                  {column.header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={!sort}
            onClick={() => sort && toggle(sort.key)}
            aria-label={sort?.direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface text-ink-2 transition-colors duration-instant hover:bg-surface-hover disabled:opacity-50"
          >
            {sort?.direction === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
          </button>
        </div>
      )}

      <ul className="space-y-2 md:hidden">
        {sorted.map((row) => {
          const content = (
            <>
              <div className="text-label text-ink-1">{primary.cell(row)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {secondary.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-caption text-ink-3">{column.header}</dt>
                    <dd className="truncate text-body text-ink-1">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return (
            <li key={getRowKey(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="w-full rounded-lg border border-hairline bg-surface p-4 text-left transition-[border-color,transform] duration-instant ease-out hover:border-line-strong active:scale-[0.99]"
                >
                  {content}
                </button>
              ) : (
                <div className="rounded-lg border border-hairline bg-surface p-4">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
