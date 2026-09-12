import { useEffect, useState } from 'react';

/**
 * True only once `active` has held continuously for `delayMs`.
 *
 * Used to stop loaders from flashing: Firebase restores a persisted session in
 * well under 100ms, so showing a "checking your session" spinner the moment a
 * page mounts means every visit blinks a spinner that was never needed. Wait,
 * and most visits never see one at all.
 */
export function useDelayed(active: boolean, delayMs = 350): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(id);
  }, [active, delayMs]);

  return active && elapsed;
}
