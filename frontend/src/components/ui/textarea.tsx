import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-20 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-[16px] text-ink-1 transition-colors duration-instant ease-out md:text-body',
      'placeholder:text-ink-3 hover:border-line-strong',
      'disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:opacity-60',
      'aria-[invalid=true]:border-critical',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
