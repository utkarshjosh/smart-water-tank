import { useSearchParams } from 'react-router-dom';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LevelHistory } from './LevelHistory';
import { UsageHistory } from './UsageHistory';

type View = 'usage' | 'level';

/**
 * History: water USED over time (days, weeks, months) first, because that is
 * what people come here to look at; the level/volume/temperature/battery
 * chart stays one tap away under "Level".
 */
export default function HistoryTab() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'level' ? 'level' : 'usage';

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="History view"
        value={view}
        onChange={(next) => {
          const p = new URLSearchParams(params);
          p.set('view', next);
          setParams(p, { replace: true });
        }}
        options={[
          { value: 'usage', label: 'Water used' },
          { value: 'level', label: 'Level & sensors' },
        ]}
      />
      {view === 'usage' ? <UsageHistory /> : <LevelHistory />}
    </div>
  );
}
