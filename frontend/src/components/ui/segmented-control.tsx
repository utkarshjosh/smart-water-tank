import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional dot colour - used to tie a metric tab to its series colour. */
  swatch?: string;
}

/**
 * The metric/section switcher. Scrolls horizontally rather than wrapping, so a
 * five-option control never becomes two rows on a narrow phone.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-sunk p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              // 44px on touch, tightening to 36px where a pointer is precise.
              'flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-label transition-[background-color,color,box-shadow] duration-quick ease-out md:h-9',
              active ? 'bg-surface text-ink-1 shadow-raised' : 'text-ink-2 hover:text-ink-1'
            )}
          >
            {option.swatch && (
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: option.swatch }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
