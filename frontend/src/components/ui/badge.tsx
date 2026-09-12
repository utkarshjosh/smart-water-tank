import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status variants pair a wash background with the darkened `-text` step, which
 * clears 4.5:1 on both the surface and the wash. Status is never carried by
 * colour alone - callers add an icon or the word itself.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-sunk text-ink-2',
        brand: 'bg-brand-wash text-brand',
        good: 'bg-good-wash text-good-text',
        warning: 'bg-warning-wash text-warning-text',
        serious: 'bg-serious-wash text-serious-text',
        critical: 'bg-critical-wash text-critical-text',
        outline: 'border border-hairline text-ink-2',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
