import { useNavigate, useParams } from 'react-router-dom';
import { TankSetupWizard } from '@/components/tank-setup/TankSetupWizard';

export default function TankSetupPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  if (!deviceId) return null;

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Set up tank profile</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Confirm the physical tank details for accurate readings.</p>
        </div>
        <TankSetupWizard
          deviceId={deviceId}
          onComplete={() => navigate('/app/devices')}
          onSkip={() => navigate('/app/devices')}
        />
      </div>
    </div>
  );
}
