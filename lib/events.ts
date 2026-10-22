// In-memory event data for Story 1 (Browse events). No database: data lives
// in server memory and resets when the server restarts.

export type EventRecord = {
  event_id: string;
  club_id: string;
  title: string;
  starts_at: string; // ISO 8601, UTC
  location: string;
  price_cents: number;
  capacity: number;
  status: "published" | "cancelled";
};

export type OrderRecord = {
  order_id: string;
  user_id: string;
  event_id: string;
  seats: number;
  status: "held" | "paid" | "cancelled" | "refunded";
  created_at: string;
};

export type EventSummary = Pick<
  EventRecord,
  "event_id" | "club_id" | "title" | "starts_at" | "location" | "price_cents" | "capacity"
> & {
  seats_remaining: number;
  sold_out: boolean;
};

// Held and paid orders both occupy seats; cancelled and refunded ones do not.
const SEAT_HOLDING_STATUSES: ReadonlySet<OrderRecord["status"]> = new Set(["held", "paid"]);

export function createEventStore(data: { events: EventRecord[]; orders: OrderRecord[] }) {
  const events = [...data.events];
  const orders = [...data.orders];

  function seatsTaken(eventId: string): number {
    return orders
      .filter((o) => o.event_id === eventId && SEAT_HOLDING_STATUSES.has(o.status))
      .reduce((sum, o) => sum + o.seats, 0);
  }

  function listUpcomingEvents(now: Date = new Date()): EventSummary[] {
    return events
      .filter((e) => e.status === "published" && new Date(e.starts_at).getTime() > now.getTime())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map((e) => {
        const seats_remaining = Math.max(0, e.capacity - seatsTaken(e.event_id));
        return {
          event_id: e.event_id,
          club_id: e.club_id,
          title: e.title,
          starts_at: e.starts_at,
          location: e.location,
          price_cents: e.price_cents,
          capacity: e.capacity,
          seats_remaining,
          sold_out: seats_remaining === 0,
        };
      });
  }

  return { listUpcomingEvents };
}

export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Demo data, dated relative to server start so the events are always upcoming.
function seedData(now: Date): { events: EventRecord[]; orders: OrderRecord[] } {
  const daysFromNow = (days: number, hourUtc: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  };

  return {
    events: [
      {
        event_id: "evt-carnival",
        club_id: "club-activities-board",
        title: "Spring Carnival Kickoff Concert",
        starts_at: daysFromNow(3, 23),
        location: "Cohon Center, Rangos Ballroom",
        price_cents: 1500,
        capacity: 120,
        status: "published",
      },
      {
        event_id: "evt-scotch-n-soda",
        club_id: "club-scotch-n-soda",
        title: "Scotch'n'Soda Fall Musical",
        starts_at: daysFromNow(6, 0),
        location: "Purnell Center, Philip Chosky Theater",
        price_cents: 1000,
        capacity: 4,
        status: "published",
      },
      {
        event_id: "evt-hackathon",
        club_id: "club-scottylabs",
        title: "ScottyLabs Hack Night",
        starts_at: daysFromNow(10, 22),
        location: "Gates Hillman Center 4401",
        price_cents: 0,
        capacity: 60,
        status: "published",
      },
      {
        event_id: "evt-past-mixer",
        club_id: "club-activities-board",
        title: "Welcome Week Mixer",
        starts_at: daysFromNow(-14, 22),
        location: "The Cut",
        price_cents: 0,
        capacity: 200,
        status: "published",
      },
    ],
    orders: [
      { order_id: "ord-1", user_id: "demo-1", event_id: "evt-carnival", seats: 4, status: "paid", created_at: now.toISOString() },
      { order_id: "ord-2", user_id: "demo-2", event_id: "evt-carnival", seats: 2, status: "held", created_at: now.toISOString() },
      // Fills the musical to capacity so the demo shows a sold-out event.
      { order_id: "ord-3", user_id: "demo-3", event_id: "evt-scotch-n-soda", seats: 4, status: "paid", created_at: now.toISOString() },
    ],
  };
}

// Single server-wide store. Kept on globalThis so Next.js dev hot reloads
// don't reset it between requests.
const globalForStore = globalThis as unknown as { tartanEventStore?: ReturnType<typeof createEventStore> };
export const eventStore = (globalForStore.tartanEventStore ??= createEventStore(seedData(new Date())));
