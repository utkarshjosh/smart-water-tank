import { AddDeviceWizard } from '@/components/onboarding/AddDeviceWizard';

export default function OnboardingPage() {
  return (
    <div className="flex justify-center px-4 py-6">
      <div className="w-full max-w-md">
        <AddDeviceWizard />
      </div>
    </div>
  );
}
