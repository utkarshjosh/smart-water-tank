import { useQuery } from '@tanstack/react-query';
import { historySeriesSchema, type HistorySeries } from '@aquamind/contracts';
import type * as contracts from '@aquamind/contracts';
import { get } from '@/lib/api';
import type { Bucket, Metric, RequestedBucket, SeriesPoint } from '@/lib/metrics';

export * from '@/lib/metrics';

/** The response of /history/series, straight from the contract. */
export type HistorySeriesResponse = HistorySeries;

// lib/metrics keeps its own copies of the chart vocabulary so the chart chunk
// never imports this module (see its header). These assignments make the
// compiler prove the copies still match the contract in both directions.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _bucketsMatch: Equal<Bucket, contracts.Bucket> = true;
const _requestedBucketsMatch: Equal<RequestedBucket, contracts.RequestedBucket> = true;
const _pointsMatch: Equal<SeriesPoint, contracts.SeriesPoint> = true;
void _bucketsMatch;
void _requestedBucketsMatch;
void _pointsMatch;

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
    queryFn: () =>
      get(`/api/v1/user/devices/${deviceId}/history/series`, historySeriesSchema, {
        params: { from, to, bucket, ...(metrics ? { metrics: metrics.join(',') } : {}) },
      }),
  });
}
