import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Shared frame for log in / sign up / reset. One column on a phone; the
 * supporting panel appears only when there is room for it, so nothing is
 * rendered off-screen and hidden with overflow.
 */
export function AuthLayout({
  title,
  subtitle,
  aside,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
        {aside && (
          <section className="hidden flex-col justify-between border-r border-hairline bg-surface px-8 py-8 lg:flex">
            <Link to="/welcome" className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="text-title">AquaMind</span>
            </Link>
            <div className="max-w-md pb-6">{aside}</div>
            <span className="text-caption text-ink-3">© {new Date().getFullYear()} AquaMind</span>
          </section>
        )}

        <main className="flex items-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-sm">
            <Link to="/welcome" className="mb-8 flex items-center gap-2.5 lg:hidden">
              <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="text-title">AquaMind</span>
            </Link>

            <h1 className="text-[1.75rem] leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-body text-ink-2">{subtitle}</p>}

            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-body text-ink-2">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
