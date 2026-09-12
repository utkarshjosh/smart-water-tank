import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Bucket, Metric, RequestedBucket, SeriesPoint } from '@/lib/metrics';

export * from '@/lib/metrics';

export interface HistorySeriesResponse {
  device_id: string;
  from: string;
  to: string;
  requested_from: string;
  bucket: Bucket;
  requested_bucket: RequestedBucket;
  bucket_seconds: number | null;
  point_count: number;
  truncated: boolean;
  has_tank_profile: boolean;
  columns: ['t', 'min', 'avg', 'max'];
  series: Record<string, { unit: string; points: SeriesPoint[] }>;
  samples: [number, number][];
}

export function useHistorySeries({
  deviceId,
  from,
  to,
  bucket = 'auto',
  metrics,
  enabled = true,
}: {
  deviceId: string | undefined;
  from: string;
  to: string;
  bucket?: RequestedBucket;
  metrics?: Metric[];
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['history-series', deviceId, from, to, bucket, metrics?.join(',')],
    enabled: Boolean(deviceId) && enabled,
    // The chart dims and keeps the old shape while a wider range loads rather
    // than blanking, so zooming out never flashes an empty plot.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data } = await api.get<HistorySeriesResponse>(
        `/api/v1/user/devices/${deviceId}/history/series`,
        { params: { from, to, bucket, ...(metrics ? { metrics: metrics.join(',') } : {}) } }
      );
      return data;
    },
  });
}
