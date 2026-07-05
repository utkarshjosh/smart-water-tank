import { useNavigate, useParams } from 'react-router-dom';
import { TankSetupWizard } from '@/components/tank-setup/TankSetupWizard';

export default function TankSetupPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  if (!deviceId) return null;

  return (
    <div className="flex justify-center px-4 py-6">
      <div className="w-full max-w-md">
        <TankSetupWizard
          deviceId={deviceId}
          onComplete={() => navigate('/app/devices')}
          onSkip={() => navigate('/app/devices')}
        />
      </div>
    </div>
  );
}
