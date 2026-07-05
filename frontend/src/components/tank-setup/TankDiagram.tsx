interface TankDiagramProps {
  shape: 'cylindrical' | 'cuboidal' | null;
  unitCount?: number;
  fillPercent?: number | null;
  className?: string;
}

const UNIT_WIDTH = 90;
const UNIT_HEIGHT = 130;
const GAP = 24;
const CAP_HEIGHT = 16;
const MARGIN = 20;

export default function TankDiagram({ shape, unitCount = 1, fillPercent = null, className }: TankDiagramProps) {
  const count = Math.max(1, unitCount);
  const width = count * UNIT_WIDTH + (count - 1) * GAP + MARGIN * 2;
  const height = UNIT_HEIGHT + MARGIN * 2;
  const clampedFill = fillPercent == null ? null : Math.min(100, Math.max(0, fillPercent));
  const pipeY = height - MARGIN - 14;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Tank setup diagram">
      {count > 1 && (
        <line
          x1={MARGIN + UNIT_WIDTH / 2}
          y1={pipeY}
          x2={width - MARGIN - UNIT_WIDTH / 2}
          y2={pipeY}
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          className="text-sky-400/60"
        />
      )}
      {Array.from({ length: count }).map((_, i) => {
        const x = MARGIN + i * (UNIT_WIDTH + GAP);
        const usableHeight = UNIT_HEIGHT - CAP_HEIGHT;
        const fillHeight = clampedFill == null ? 0 : usableHeight * (clampedFill / 100);

        return (
          <g key={i} transform={`translate(${x}, ${MARGIN})`}>
            {shape === 'cuboidal' ? (
              <>
                <rect
                  x={0}
                  y={0}
                  width={UNIT_WIDTH}
                  height={UNIT_HEIGHT}
                  rx={6}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  className="text-slate-400"
                />
                {clampedFill != null && (
                  <rect
                    x={3}
                    y={UNIT_HEIGHT - fillHeight - 3}
                    width={UNIT_WIDTH - 6}
                    height={Math.max(0, fillHeight - 3)}
                    className="fill-cyan-400/70"
                  />
                )}
              </>
            ) : (
              <>
                <rect
                  x={0}
                  y={CAP_HEIGHT / 2}
                  width={UNIT_WIDTH}
                  height={UNIT_HEIGHT - CAP_HEIGHT}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  className="text-slate-400"
                />
                <ellipse
                  cx={UNIT_WIDTH / 2}
                  cy={CAP_HEIGHT / 2}
                  rx={UNIT_WIDTH / 2}
                  ry={CAP_HEIGHT / 2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  className="text-slate-400"
                />
                <ellipse
                  cx={UNIT_WIDTH / 2}
                  cy={UNIT_HEIGHT - CAP_HEIGHT / 2}
                  rx={UNIT_WIDTH / 2}
                  ry={CAP_HEIGHT / 2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  className="text-slate-400"
                />
                {clampedFill != null && (
                  <rect
                    x={3}
                    y={UNIT_HEIGHT - CAP_HEIGHT / 2 - fillHeight}
                    width={UNIT_WIDTH - 6}
                    height={Math.max(0, fillHeight)}
                    className="fill-cyan-400/70"
                  />
                )}
              </>
            )}
            {i === 0 && (
              <g transform={`translate(${UNIT_WIDTH / 2}, -8)`}>
                <line x1={0} y1={0} x2={0} y2={10} stroke="currentColor" strokeWidth={2} className="text-amber-400" />
                <circle cx={0} cy={0} r={5} fill="currentColor" className="text-amber-400" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
