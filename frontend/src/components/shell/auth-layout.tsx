import { Link } from 'react-router-dom';
import { ArrowLeft, Drop, ShieldCheck, Waves } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import './workspace.css';

/** Shared responsive entry experience for login, signup and password recovery. */
export function AuthLayout({ title, subtitle, aside, children, footer }: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-experience">
      <section className="auth-story">
        <Link to="/welcome" className="workspace-wordmark"><Drop size={30} weight="fill" /> AquaMind</Link>
        <div className="auth-story-copy">{aside || <><span className="workspace-eyebrow">A little more peace of mind</span><h2>Your water.<br />In good hands.</h2></>}</div>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
          <img src="/images/landing-tank.webp" alt="" width={960} height={960} />
          <span className="auth-art-caption"><Waves size={20} /> Clarity, down to the last litre.</span>
        </div>
        <div className="auth-story-footer"><span>Intelligent water monitoring</span><span>© {new Date().getFullYear()} AquaMind</span></div>
      </section>
      <main className="auth-main">
        <Link to="/welcome" className="auth-back"><ArrowLeft size={16} /> Back to AquaMind</Link>
        <div className="auth-form-panel">
          <div className="auth-form-icon"><Drop size={27} weight="duotone" /></div>
          <p className="workspace-eyebrow">Your AquaMind workspace</p>
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          <div className="auth-fields">{children}</div>
          {footer && <div className="auth-form-footer">{footer}</div>}
        </div>
        <p className="auth-security"><ShieldCheck size={16} /> One secure login for tank owners and administrators</p>
      </main>
    </div>
  );
}
