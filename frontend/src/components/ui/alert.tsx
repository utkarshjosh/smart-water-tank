import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Info, Warning, WarningOctagon, CheckCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex gap-3 rounded-lg border px-4 py-3 text-body', {
  variants: {
    variant: {
      info: 'border-hairline bg-surface-sunk text-ink-1',
      good: 'border-good/25 bg-good-wash text-good-text',
      warning: 'border-warning/40 bg-warning-wash text-warning-text',
      critical: 'border-critical/25 bg-critical-wash text-critical-text',
    },
  },
  defaultVariants: { variant: 'info' },
});

const ICONS = { info: Info, good: CheckCircle, warning: Warning, critical: WarningOctagon } as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Set false only when the caller supplies its own leading element. */
  icon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', icon = true, children, ...props }, ref) => {
    const Icon = ICONS[variant ?? 'info'];
    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        {icon && <Icon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-label', className)} {...props} />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-body opacity-90', className)} {...props} />
  )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
