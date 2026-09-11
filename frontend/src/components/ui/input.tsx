import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 16px minimum on mobile: anything smaller makes iOS Safari zoom the viewport
 * on focus, which is most of why forms feel broken on a phone.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-11 w-full rounded-md border border-hairline bg-surface px-3 text-[16px] text-ink-1 transition-colors duration-instant ease-out md:h-10 md:text-body',
        'placeholder:text-ink-3 hover:border-line-strong',
        'disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:opacity-60',
        'aria-[invalid=true]:border-critical',
        'file:border-0 file:bg-transparent file:text-label file:text-ink-1',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
