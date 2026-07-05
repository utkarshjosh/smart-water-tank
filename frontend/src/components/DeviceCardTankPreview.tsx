import { lazy, Suspense } from 'react';

const GlassTank = lazy(() => import('@/components/GlassTank'));

export default function DeviceCardTankPreview({ level, alert }: { level: number; alert: string | null }) {
  return (
    <div className="flex h-28 justify-center overflow-hidden">
      <div className="scale-[0.35] origin-top">
        <Suspense fallback={<div className="h-80 w-64" />}>
          <GlassTank level={level} alert={alert} />
        </Suspense>
      </div>
    </div>
  );
}
