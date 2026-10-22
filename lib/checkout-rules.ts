// Constants and formatting shared by the server (lib/events.ts) and the browser
// (components/EventActions.tsx). Kept apart so the browser never imports the event store.

export const MAX_SEATS_PER_ORDER = 4;
export const HOLD_MINUTES = 10;

export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}
