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
    time: new Date(measurement.timestamp).toLocaleString(),
    volume: Number.parseFloat(measurement.volume_l.toString()),
  }));

  if (chartData.length === 0) {
    return <p className="text-muted-foreground">No history data available</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="volume" stroke="#8884d8" />
      </LineChart>
    </ResponsiveContainer>
  );
}
