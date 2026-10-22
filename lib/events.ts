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
  // Story 3 fields. Seeded demo orders leave these out (their holds never expire).
  hold_expires_at?: string; // ISO 8601, UTC
  total_cents?: number;
  qr_token?: string;
};

export { MAX_SEATS_PER_ORDER, HOLD_MINUTES, formatPrice } from "./checkout-rules";
import { MAX_SEATS_PER_ORDER, HOLD_MINUTES } from "./checkout-rules";
// SEC-16: more than 5 checkouts for one event in 10 minutes blocks the account for 30.
const CHECKOUT_LIMIT = 5;
const CHECKOUT_WINDOW_MS = 10 * 60_000;
const CHECKOUT_BLOCK_MS = 30 * 60_000;
const MAX_NAME_LENGTH = 60;

export type CheckoutInput = { eventId: string; name: string; seats: number };

export type CheckoutResult =
  | { ok: true; order: OrderRecord & { hold_expires_at: string; total_cents: number } }
  | { ok: false; code: "event_not_found" }
  | { ok: false; code: "name_required" }
  | { ok: false; code: "invalid_seats" }
  | { ok: false; code: "over_limit"; max: number }
  | { ok: false; code: "rate_limited"; retry_after_seconds: number }
  | { ok: false; code: "sold_out"; offer_waitlist: true }
  | { ok: false; code: "not_enough_seats"; seats_remaining: number };

export type Receipt = {
  order_id: string;
  event_title: string;
  buyer_name: string;
  seats: number;
  total_cents: number;
  qr_token: string;
};

export type PaymentResult =
  | { ok: true; outcome: "paid"; receipt: Receipt }
  | { ok: true; outcome: "declined" }
  | { ok: false; code: "order_not_found" }
  | { ok: false; code: "hold_expired"; offer_waitlist: boolean };

// 128 random bits as hex. Contains no personal information.
function newQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

  // A hold that has run out of time gives its seats back.
  function releaseExpiredHolds(now: Date) {
    for (const o of orders) {
      if (o.status === "held" && o.hold_expires_at && new Date(o.hold_expires_at).getTime() <= now.getTime()) {
        o.status = "cancelled";
      }
    }
  }

  function seatsRemaining(event: EventRecord): number {
    return Math.max(0, event.capacity - seatsTaken(event.event_id));
  }

  function listUpcomingEvents(now: Date = new Date()): EventSummary[] {
    releaseExpiredHolds(now);
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

  const checkoutStarts = new Map<string, number[]>(); // "name|event" -> start times (ms)
  const blockedUntil = new Map<string, number>();

  function startCheckout(input: CheckoutInput, now: Date = new Date()): CheckoutResult {
    const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) return { ok: false, code: "name_required" };
    if (!Number.isInteger(input.seats) || input.seats < 1) return { ok: false, code: "invalid_seats" };
    if (input.seats > MAX_SEATS_PER_ORDER) return { ok: false, code: "over_limit", max: MAX_SEATS_PER_ORDER };

    const event = events.find((e) => e.event_id === input.eventId && e.status === "published");
    if (!event) return { ok: false, code: "event_not_found" };

    const nowMs = now.getTime();
    const key = `${name.toLowerCase()}|${event.event_id}`;
    const blocked = blockedUntil.get(key) ?? 0;
    if (blocked > nowMs) {
      return { ok: false, code: "rate_limited", retry_after_seconds: Math.ceil((blocked - nowMs) / 1000) };
    }
    const recent = (checkoutStarts.get(key) ?? []).filter((t) => nowMs - t < CHECKOUT_WINDOW_MS);
    if (recent.length >= CHECKOUT_LIMIT) {
      blockedUntil.set(key, nowMs + CHECKOUT_BLOCK_MS);
      checkoutStarts.set(key, recent);
      return { ok: false, code: "rate_limited", retry_after_seconds: CHECKOUT_BLOCK_MS / 1000 };
    }
    checkoutStarts.set(key, [...recent, nowMs]);

    // Everything below runs without awaiting, so two buyers can never both take the last seat.
    releaseExpiredHolds(now);
    const remaining = seatsRemaining(event);
    if (remaining === 0) return { ok: false, code: "sold_out", offer_waitlist: true };
    if (input.seats > remaining) return { ok: false, code: "not_enough_seats", seats_remaining: remaining };

    const order = {
      order_id: `ord-${crypto.randomUUID()}`,
      user_id: name,
      event_id: event.event_id,
      seats: input.seats,
      status: "held" as const,
      created_at: now.toISOString(),
      hold_expires_at: new Date(nowMs + HOLD_MINUTES * 60_000).toISOString(),
      // SEC-8: the server computes the amount from the stored price, never from the browser.
      total_cents: event.price_cents * input.seats,
    };
    orders.push(order);
    return { ok: true, order };
  }

  function completePayment(orderId: string, outcome: "approve" | "decline", now: Date = new Date()): PaymentResult {
    releaseExpiredHolds(now);
    const order = orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, code: "order_not_found" };
    const event = events.find((e) => e.event_id === order.event_id)!;

    if (order.status === "paid" && outcome === "approve") {
      return { ok: true, outcome: "paid", receipt: receiptFor(order, event) };
    }
    if (order.status !== "held") {
      return { ok: false, code: "hold_expired", offer_waitlist: seatsRemaining(event) === 0 };
    }
    if (outcome === "decline") {
      order.status = "cancelled";
      return { ok: true, outcome: "declined" };
    }
    order.status = "paid";
    order.qr_token = newQrToken();
    return { ok: true, outcome: "paid", receipt: receiptFor(order, event) };
  }

  function receiptFor(order: OrderRecord, event: EventRecord): Receipt {
    return {
      order_id: order.order_id,
      event_title: event.title,
      buyer_name: order.user_id,
      seats: order.seats,
      total_cents: order.total_cents ?? event.price_cents * order.seats,
      qr_token: order.qr_token!,
    };
  }

  return { listUpcomingEvents, startCheckout, completePayment };
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
