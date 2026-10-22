// Story 3: Buy tickets
// AC1: WHEN a student buys tickets, THE system SHALL cap the order at 4 seats.
// AC2: WHEN a student starts checkout, THE system SHALL hold the seats for 10 minutes.
// AC3: WHEN a payment succeeds, THE system SHALL email a receipt with a QR code within 1 minute.
//      (HW3 scope: no email service, so the receipt and QR code are shown on screen.)
// AC4: IF a card is declined, THEN THE system SHALL release the held seats.
// AC5: IF the event sells out during checkout, THEN THE system SHALL offer the waitlist.
// Also covered from the other specs: SEC-8 (server sets the price), SEC-16 (checkout
// hoarding limit), requirements section 8 (50 buyers, 1 last seat).
import { describe, it, expect } from "vitest";
import { createEventStore, type EventRecord } from "@/lib/events";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as payOrder } from "@/app/api/orders/[id]/pay/route";

const NOW = new Date("2026-10-22T12:00:00Z");
const minutesAfter = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    event_id: "e1",
    club_id: "c1",
    title: "Spring Carnival Kickoff",
    starts_at: "2026-11-01T23:00:00Z",
    location: "Cohon Center Rangos Ballroom",
    price_cents: 1500,
    capacity: 100,
    status: "published",
    ...overrides,
  };
}

function storeWith(...events: EventRecord[]) {
  return createEventStore({ events: events.length ? events : [event()], orders: [] });
}

function seatsLeft(store: ReturnType<typeof storeWith>, eventId = "e1", at: Date = NOW): number {
  return store.listUpcomingEvents(at).find((e) => e.event_id === eventId)!.seats_remaining;
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Story 3 AC1: orders are capped at 4 seats", () => {
  it("story3_order_of_4_seats_is_accepted", () => {
    const store = storeWith();
    const result = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 4 }, NOW);
    expect(result.ok).toBe(true);
    expect(seatsLeft(store)).toBe(96);
  });

  it("story3_order_of_5_seats_is_refused_and_takes_no_seats", () => {
    const store = storeWith();
    const result = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 5 }, NOW);
    expect(result).toMatchObject({ ok: false, code: "over_limit", max: 4 });
    expect(seatsLeft(store)).toBe(100);
  });

  it("story3_order_of_zero_negative_or_fractional_seats_is_refused", () => {
    const store = storeWith();
    for (const seats of [0, -1, 1.5, Number.NaN]) {
      const result = store.startCheckout({ eventId: "e1", name: "Andrew", seats }, NOW);
      expect(result).toMatchObject({ ok: false, code: "invalid_seats" });
    }
    expect(seatsLeft(store)).toBe(100);
  });

  it("story3_api_returns_400_for_more_than_4_seats", async () => {
    const response = await createOrder(jsonRequest("/api/orders", { event_id: "evt-hackathon", name: "Cap Tester", seats: 5 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("over_limit");
  });

  it("story3_api_returns_201_for_a_valid_order", async () => {
    const response = await createOrder(jsonRequest("/api/orders", { event_id: "evt-hackathon", name: "Valid Buyer", seats: 2 }));
    expect(response.status).toBe(201);
    const { order } = await response.json();
    expect(order).toMatchObject({ event_id: "evt-hackathon", seats: 2, status: "held" });
  });

  it("story3_api_returns_401_when_no_name_is_typed", async () => {
    const response = await createOrder(jsonRequest("/api/orders", { event_id: "evt-hackathon", name: "   ", seats: 1 }));
    expect(response.status).toBe(401);
  });

  it("story3_api_returns_404_for_an_unknown_event", async () => {
    const response = await createOrder(jsonRequest("/api/orders", { event_id: "nope", name: "Andrew", seats: 1 }));
    expect(response.status).toBe(404);
  });
});

describe("Story 3 AC2: seats are held for 10 minutes", () => {
  it("story3_starting_checkout_holds_seats_right_away_for_10_minutes", () => {
    const store = storeWith();
    const result = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 3 }, NOW);
    if (!result.ok) throw new Error("expected checkout to start");
    expect(result.order.status).toBe("held");
    expect(result.order.hold_expires_at).toBe(minutesAfter(10).toISOString());
    expect(seatsLeft(store)).toBe(97);
  });

  it("story3_seats_stay_held_until_10_minutes_then_return", () => {
    const store = storeWith();
    store.startCheckout({ eventId: "e1", name: "Andrew", seats: 3 }, NOW);
    expect(seatsLeft(store, "e1", new Date(minutesAfter(10).getTime() - 1000))).toBe(97);
    expect(seatsLeft(store, "e1", minutesAfter(10))).toBe(100);
  });

  it("story3_payment_after_the_hold_expires_is_refused", () => {
    const store = storeWith();
    const started = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 2 }, NOW);
    if (!started.ok) throw new Error("expected checkout to start");
    const result = store.completePayment(started.order.order_id, "approve", minutesAfter(11));
    expect(result).toMatchObject({ ok: false, code: "hold_expired" });
    expect(seatsLeft(store, "e1", minutesAfter(11))).toBe(100);
  });
});

describe("Story 3 AC3: a successful payment gives a receipt with a QR code", () => {
  it("story3_successful_payment_returns_a_receipt_with_a_qr_token", () => {
    const store = storeWith();
    const started = store.startCheckout({ eventId: "e1", name: "Andrew Carnegie", seats: 2 }, NOW);
    if (!started.ok) throw new Error("expected checkout to start");

    const paid = store.completePayment(started.order.order_id, "approve", minutesAfter(2));
    if (!paid.ok || paid.outcome !== "paid") throw new Error("expected payment to succeed");

    expect(paid.receipt).toMatchObject({
      order_id: started.order.order_id,
      event_title: "Spring Carnival Kickoff",
      buyer_name: "Andrew Carnegie",
      seats: 2,
      total_cents: 3000,
    });
    expect(paid.receipt.qr_token).toMatch(/^[0-9a-f]{32,}$/);
    expect(paid.receipt.qr_token.toLowerCase()).not.toContain("andrew");
    expect(seatsLeft(store, "e1", minutesAfter(30))).toBe(98);
  });

  it("story3_qr_tokens_are_unique_across_many_orders", () => {
    const store = storeWith(event({ capacity: 5000 }));
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const started = store.startCheckout({ eventId: "e1", name: `Buyer ${i}`, seats: 1 }, NOW);
      if (!started.ok) throw new Error("expected checkout to start");
      const paid = store.completePayment(started.order.order_id, "approve", NOW);
      if (!paid.ok || paid.outcome !== "paid") throw new Error("expected payment to succeed");
      tokens.add(paid.receipt.qr_token);
    }
    expect(tokens.size).toBe(1000);
  });

  it("story3_paying_twice_does_not_issue_a_second_ticket", () => {
    const store = storeWith();
    const started = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 1 }, NOW);
    if (!started.ok) throw new Error("expected checkout to start");
    const first = store.completePayment(started.order.order_id, "approve", NOW);
    const second = store.completePayment(started.order.order_id, "approve", NOW);
    if (!first.ok || first.outcome !== "paid" || !second.ok || second.outcome !== "paid") throw new Error("expected both to succeed");
    expect(second.receipt.qr_token).toBe(first.receipt.qr_token);
    expect(seatsLeft(store)).toBe(99);
  });

  it("story3_api_pay_returns_a_receipt", async () => {
    const created = await (await createOrder(jsonRequest("/api/orders", { event_id: "evt-hackathon", name: "Pay Tester", seats: 1 }))).json();
    const response = await payOrder(jsonRequest("/api/orders/x/pay", { outcome: "approve" }), {
      params: Promise.resolve({ id: created.order.order_id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("paid");
    expect(body.receipt.qr_token).toMatch(/^[0-9a-f]{32,}$/);
  });

  it("story3_api_pay_returns_404_for_an_unknown_order", async () => {
    const response = await payOrder(jsonRequest("/api/orders/x/pay", { outcome: "approve" }), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("Story 3 AC4: a declined card releases the held seats", () => {
  it("story3_declined_card_releases_the_held_seats", () => {
    const store = storeWith();
    const started = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 4 }, NOW);
    if (!started.ok) throw new Error("expected checkout to start");
    expect(seatsLeft(store)).toBe(96);

    const declined = store.completePayment(started.order.order_id, "decline", minutesAfter(1));
    expect(declined).toMatchObject({ ok: true, outcome: "declined" });
    expect(seatsLeft(store, "e1", minutesAfter(1))).toBe(100);
  });

  it("story3_a_declined_order_cannot_be_paid_afterwards", () => {
    const store = storeWith();
    const started = store.startCheckout({ eventId: "e1", name: "Andrew", seats: 1 }, NOW);
    if (!started.ok) throw new Error("expected checkout to start");
    store.completePayment(started.order.order_id, "decline", NOW);
    const result = store.completePayment(started.order.order_id, "approve", NOW);
    expect(result).toMatchObject({ ok: false, code: "hold_expired" });
    expect(seatsLeft(store)).toBe(100);
  });

  it("story3_api_pay_decline_returns_declined", async () => {
    const created = await (await createOrder(jsonRequest("/api/orders", { event_id: "evt-hackathon", name: "Decline Tester", seats: 1 }))).json();
    const response = await payOrder(jsonRequest("/api/orders/x/pay", { outcome: "decline" }), {
      params: Promise.resolve({ id: created.order.order_id }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("declined");
  });
});

describe("Story 3 AC5: selling out during checkout offers the waitlist", () => {
  it("story3_second_buyer_for_the_last_seat_is_offered_the_waitlist", () => {
    const store = storeWith(event({ capacity: 1 }));
    const first = store.startCheckout({ eventId: "e1", name: "First", seats: 1 }, NOW);
    expect(first.ok).toBe(true);
    const second = store.startCheckout({ eventId: "e1", name: "Second", seats: 1 }, NOW);
    expect(second).toMatchObject({ ok: false, code: "sold_out", offer_waitlist: true });
  });

  it("story3_asking_for_more_seats_than_remain_says_how_many_are_left", () => {
    const store = storeWith(event({ capacity: 3 }));
    store.startCheckout({ eventId: "e1", name: "First", seats: 1 }, NOW);
    const result = store.startCheckout({ eventId: "e1", name: "Second", seats: 4 }, NOW);
    expect(result).toMatchObject({ ok: false, code: "not_enough_seats", seats_remaining: 2 });
  });

  it("story3_late_payment_on_a_now_sold_out_event_offers_the_waitlist", () => {
    const store = storeWith(event({ capacity: 1 }));
    const first = store.startCheckout({ eventId: "e1", name: "First", seats: 1 }, NOW);
    if (!first.ok) throw new Error("expected checkout to start");
    // First buyer's hold lapses, then someone else takes the last seat.
    store.startCheckout({ eventId: "e1", name: "Second", seats: 1 }, minutesAfter(11));
    const result = store.completePayment(first.order.order_id, "approve", minutesAfter(12));
    expect(result).toMatchObject({ ok: false, code: "hold_expired", offer_waitlist: true });
  });

  it("story3_api_returns_409_with_a_waitlist_offer_when_sold_out", async () => {
    // The seeded Scotch'n'Soda musical is sold out.
    const response = await createOrder(jsonRequest("/api/orders", { event_id: "evt-scotch-n-soda", name: "Late Buyer", seats: 1 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "sold_out", offer_waitlist: true });
  });
});

describe("Story 3 extras from the requirements and security specs", () => {
  it("story3_tampered_client_price_is_ignored_sec8", async () => {
    const response = await createOrder(
      jsonRequest("/api/orders", { event_id: "evt-carnival", name: "Price Tamperer", seats: 2, price_cents: 1, total_cents: 1 }),
    );
    expect(response.status).toBe(201);
    const { order } = await response.json();
    expect(order.total_cents).toBe(3000);
  });

  it("story3_50_simultaneous_buyers_for_the_last_seat_gives_exactly_one_success", async () => {
    const store = storeWith(event({ capacity: 1 }));
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => Promise.resolve().then(() => store.startCheckout({ eventId: "e1", name: `Buyer ${i}`, seats: 1 }, NOW))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "sold_out")).toHaveLength(49);
    expect(seatsLeft(store)).toBe(0);
  });

  it("story3_sixth_checkout_in_10_minutes_is_blocked_for_30_minutes_sec16", () => {
    const store = storeWith(event({ capacity: 1000 }));
    for (let i = 0; i < 5; i++) {
      expect(store.startCheckout({ eventId: "e1", name: "Hoarder", seats: 1 }, NOW).ok).toBe(true);
    }
    expect(store.startCheckout({ eventId: "e1", name: "Hoarder", seats: 1 }, minutesAfter(1))).toMatchObject({ ok: false, code: "rate_limited" });
    expect(store.startCheckout({ eventId: "e1", name: "Hoarder", seats: 1 }, minutesAfter(30))).toMatchObject({ ok: false, code: "rate_limited" });
    expect(store.startCheckout({ eventId: "e1", name: "Hoarder", seats: 1 }, minutesAfter(32)).ok).toBe(true);
  });

  it("story3_hoarding_limit_applies_per_person_not_to_everyone", () => {
    const store = storeWith(event({ capacity: 1000 }));
    for (let i = 0; i < 6; i++) store.startCheckout({ eventId: "e1", name: "Hoarder", seats: 1 }, NOW);
    expect(store.startCheckout({ eventId: "e1", name: "Someone Else", seats: 1 }, NOW).ok).toBe(true);
  });
});
