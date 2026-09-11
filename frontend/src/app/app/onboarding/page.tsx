import { AddDeviceWizard } from '@/components/onboarding/AddDeviceWizard';

export default function OnboardingPage() {
 return (
    <div className="mx-auto w-full max-w-3xl px-0 py-1">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 ">Add device</h1>
          <p className="text-sm text-slate-600 ">
 Pair a sensor, then calibrate the tank profile.
          </p>
        </div>
        <AddDeviceWizard />
      </div>
    </div>
  );
}
