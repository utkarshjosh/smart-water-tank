import { TankVisual } from '@/components/TankVisual';

interface TankDiagramProps {
  shape: 'cylindrical' | 'cuboidal' | null;
  unitCount?: number;
  fillPercent?: number | null;
  className?: string;
}

export default function TankDiagram({
  shape,
  unitCount = 1,
  fillPercent = null,
  className,
}: TankDiagramProps) {
  const count = Number.isFinite(unitCount) ? Math.min(6, Math.max(1, Math.floor(unitCount))) : 1;
  const step = 190;
  return (
    <svg
      viewBox={`0 0 ${200 + (count - 1) * step} 196`}
      className={className}
      role="img"
      aria-label={`${count} ${shape ?? 'unconfigured'} tank${count > 1 ? 's connected together' : ''}${fillPercent == null ? '' : `, illustrative level ${fillPercent} percent`}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} x={i * step} width="200" height="196" viewBox="0 0 200 196">
          <TankVisual shape={shape ?? 'cylindrical'} level={fillPercent} animated={false} />
        </svg>
      ))}
      {Array.from({ length: count - 1 }, (_, i) => (
        <path
          key={i}
          d={`M${i * step + 165} 142H${(i + 1) * step + 35}`}
          stroke="hsl(var(--line-strong))"
          strokeWidth="3"
        />
      ))}
    </svg>
  );
}
