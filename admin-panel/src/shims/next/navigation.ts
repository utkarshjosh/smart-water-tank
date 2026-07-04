import { useCallback } from 'react';
import {
  useLocation,
  useNavigate,
  useNavigationType,
  useParams as useRouterParams,
  useSearchParams,
} from 'react-router-dom';

export function useRouter() {
  const navigate = useNavigate();

  return {
    push: useCallback((href: string) => navigate(href), [navigate]),
    replace: useCallback((href: string) => navigate(href, { replace: true }), [navigate]),
    back: useCallback(() => navigate(-1), [navigate]),
    forward: useCallback(() => navigate(1), [navigate]),
    refresh: useCallback(() => window.location.reload(), []),
    prefetch: useCallback(async () => {}, []),
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string | undefined>>() {
  return useRouterParams() as T;
}

export { useSearchParams, useNavigationType };
