import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from 'react';

export interface ShellHeading {
  title?: string;
  subtitle?: string;
}

interface ShellContextValue {
  /** Stable across renders - it is a `useState` setter from the layout. */
  setHeading: Dispatch<SetStateAction<ShellHeading>>;
  /** Where `ShellAction` portals its children, once the header has mounted. */
  actionSlot: HTMLElement | null;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * Publishes a page's title into the persistent header.
 *
 * The shell now outlives the page, so a route can no longer pass its title down
 * as a prop - it has to hand it up. Only strings cross this boundary: they
 * compare by value, so a page re-rendering with the same title does not loop
 * through the layout's state.
 */
export function usePageHeading(title?: string, subtitle?: string) {
  const setHeading = useContext(ShellContext)?.setHeading;

  useEffect(() => {
    if (!setHeading) return;
    setHeading({ title, subtitle });
    // Clearing on unmount keeps a previous page's title off the next one. The
    // clear and the next page's set land in the same commit, so the header
    // never blinks empty between routes.
    return () => setHeading({});
  }, [setHeading, title, subtitle]);
}
