'use client';

import { useSyncExternalStore } from 'react';

// Include small landscape phones without changing the regular desktop layout.
const PHONE_QUERY =
  '(max-width: 760px), (max-width: 960px) and (max-height: 500px)';
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
export function usePhoneLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
