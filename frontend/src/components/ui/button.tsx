import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Every interactive surface gets a press state. A 90ms scale on :active is the
 * cheapest thing that makes a UI feel responsive rather than dead.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-label transition-[background-color,border-color,color,transform] duration-instant ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink hover:bg-brand-press',
        secondary:
          'border border-hairline bg-surface text-ink-1 hover:bg-surface-hover hover:border-line-strong',
        ghost: 'text-ink-2 hover:bg-surface-hover hover:text-ink-1',
        danger: 'bg-critical text-white hover:brightness-95',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        // 44px is the floor for anything a thumb has to find.
        md: 'h-11 px-4 md:h-10',
        sm: 'h-9 px-3',
        lg: 'h-12 px-5',
        icon: 'h-11 w-11 md:h-10 md:w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Swaps the label for a spinner and blocks input, keeping the width stable. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            <span className="sr-only">Working</span>
            <span aria-hidden className="inline-flex items-center justify-center gap-2 whitespace-nowrap opacity-60">
              {children}
            </span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
