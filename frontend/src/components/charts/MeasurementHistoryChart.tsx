import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface MeasurementPoint {
  timestamp: string;
  level_cm: number | string;
  volume_l: number | string;
  level_percent: number | string | null;
  temperature_c: number | string | null;
  battery_v: number | string | null;
}

export type Metric = 'level_percent' | 'volume_l' | 'temperature_c' | 'battery_v';

export const METRIC_CONFIG: Record<Metric, { label: string; color: string; unit: string }> = {
  level_percent: { label: 'Level', color: '#0891b2', unit: '%' },
  volume_l: { label: 'Volume', color: '#2563eb', unit: 'L' },
  temperature_c: { label: 'Temperature', color: '#f97316', unit: '°C' },
  battery_v: { label: 'Battery', color: '#16a34a', unit: 'V' },
};

export default function MeasurementHistoryChart({ history, metric }: { history: MeasurementPoint[]; metric: Metric }) {
  const config = METRIC_CONFIG[metric];
  const chartData = history
    .map((m) => {
      const raw = m[metric];
      return { time: new Date(m.timestamp).toLocaleString(), value: raw == null ? null : Number.parseFloat(raw.toString()) };
    })
    .filter((d): d is { time: string; value: number } => d.value !== null)
    .reverse();

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground">No {config.label.toLowerCase()} data available yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={false} />
        <YAxis unit={config.unit} width={50} />
        <Tooltip formatter={(value: number) => [`${value}${config.unit}`, config.label]} />
        <Line type="monotone" dataKey="value" stroke={config.color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
