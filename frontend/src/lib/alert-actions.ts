/** Bound request concurrency and report partial success without hiding failed alerts. */
export async function markAlertsRead(ids: string[], send: (id: string) => Promise<unknown>) {
  const succeeded: string[] = [];
  const failed: string[] = [];
  for (let start = 0; start < ids.length; start += 5) {
    const batch = ids.slice(start, start + 5);
    const results = await Promise.allSettled(batch.map(send));
    results.forEach((result, index) =>
      (result.status === 'fulfilled' ? succeeded : failed).push(batch[index])
    );
  }
  return { succeeded, failed };
}
