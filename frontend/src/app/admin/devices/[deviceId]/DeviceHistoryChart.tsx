import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DeviceHistoryMeasurement {
  timestamp: string;
  volume_l: number | string;
}

export default function DeviceHistoryChart({
  history,
}: {
  history: DeviceHistoryMeasurement[];
}) {
  const chartData = history.map((measurement) => ({
    time: new Date(measurement.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    volume: Number.parseFloat(measurement.volume_l.toString()),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        No history data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="time"
          axisLine={false}
          tickLine={false}
          minTickGap={28}
          tick={{ fill: '#64748b', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#64748b', fontSize: 12 }}
          width={48}
          unit="L"
        />
        <Tooltip
          cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
          contentStyle={{
            borderRadius: 8,
            borderColor: '#cbd5e1',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            fontSize: 12,
          }}
          formatter={(value) => [`${Number(value).toFixed(1)}L`, 'Volume']}
        />
        <Line
          type="monotone"
          dataKey="volume"
          stroke="#0284c7"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
