// Story 1: Browse events
// AC1: THE system SHALL list upcoming events with the date, location, price, and seats remaining.
// AC2: WHILE an event is sold out, THE system SHALL show a "Join waitlist" button instead of "Buy".
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createEventStore, formatPrice, formatEventDate, type EventRecord, type OrderRecord } from "@/lib/events";
import { EventList } from "@/components/EventList";
import { GET } from "@/app/api/events/route";

const NOW = new Date("2026-10-22T12:00:00Z");

function event(overrides: Partial<EventRecord>): EventRecord {
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

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return {
    order_id: "o1",
    user_id: "u1",
    event_id: "e1",
    seats: 1,
    status: "paid",
    created_at: "2026-10-20T12:00:00Z",
    ...overrides,
  };
}

describe("Story 1 AC1: list upcoming events", () => {
  it("story1_lists_only_upcoming_published_events_soonest_first", () => {
    const store = createEventStore({
      events: [
        event({ event_id: "later", starts_at: "2026-12-01T00:00:00Z" }),
        event({ event_id: "past", starts_at: "2026-10-01T00:00:00Z" }),
        event({ event_id: "soon", starts_at: "2026-10-25T00:00:00Z" }),
        event({ event_id: "cancelled", status: "cancelled" }),
      ],
      orders: [],
    });

    const ids = store.listUpcomingEvents(NOW).map((e) => e.event_id);
    expect(ids).toEqual(["soon", "later"]);
  });

  it("story1_seats_remaining_subtracts_paid_and_held_orders_only", () => {
    const store = createEventStore({
      events: [event({ capacity: 10 })],
      orders: [
        order({ order_id: "a", seats: 3, status: "paid" }),
        order({ order_id: "b", seats: 2, status: "held" }),
        order({ order_id: "c", seats: 4, status: "refunded" }),
        order({ order_id: "d", seats: 4, status: "cancelled" }),
      ],
    });

    const [summary] = store.listUpcomingEvents(NOW);
    expect(summary.seats_remaining).toBe(5);
    expect(summary.sold_out).toBe(false);
  });

  it("story1_page_shows_date_location_price_and_seats_remaining", () => {
    const store = createEventStore({
      events: [event({ capacity: 100 })],
      orders: [order({ seats: 4 })],
    });
    render(<EventList events={store.listUpcomingEvents(NOW)} />);

    const card = screen.getByRole("article", { name: "Spring Carnival Kickoff" });
    expect(within(card).getByText(formatEventDate("2026-11-01T23:00:00Z"))).toBeInTheDocument();
    expect(within(card).getByText("Cohon Center Rangos Ballroom")).toBeInTheDocument();
    expect(within(card).getByText("$15.00")).toBeInTheDocument();
    expect(within(card).getByText("96 seats left")).toBeInTheDocument();
  });

  it("story1_formats_prices_and_dates_for_display", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(500)).toBe("$5.00");
    expect(formatPrice(1250)).toBe("$12.50");
    // Shown in Pittsburgh time regardless of server time zone.
    expect(formatEventDate("2026-11-01T23:00:00Z")).toBe("Sun, Nov 1, 2026, 6:00 PM");
  });

  it("story1_shows_empty_state_when_no_upcoming_events", () => {
    render(<EventList events={[]} />);
    expect(screen.getByText("No upcoming events yet.")).toBeInTheDocument();
  });

  it("story1_event_text_rendered_as_plain_text", () => {
    const store = createEventStore({
      events: [event({ title: "<script>alert('x')</script>" })],
      orders: [],
    });
    const { container } = render(<EventList events={store.listUpcomingEvents(NOW)} />);
    expect(screen.getByText("<script>alert('x')</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("story1_GET_api_events_returns_200_with_required_fields", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    for (const e of body.events) {
      expect(e).toEqual(
        expect.objectContaining({
          event_id: expect.any(String),
          title: expect.any(String),
          starts_at: expect.any(String),
          location: expect.any(String),
          price_cents: expect.any(Number),
          seats_remaining: expect.any(Number),
          sold_out: expect.any(Boolean),
        }),
      );
      expect(new Date(e.starts_at).getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe("Story 1 AC2: sold-out events show Join waitlist instead of Buy", () => {
  it("story1_sold_out_event_shows_join_waitlist_not_buy", () => {
    const store = createEventStore({
      events: [event({ capacity: 4 })],
      orders: [order({ seats: 4 })],
    });
    const events = store.listUpcomingEvents(NOW);
    expect(events[0].sold_out).toBe(true);
    expect(events[0].seats_remaining).toBe(0);

    render(<EventList events={events} />);
    const card = screen.getByRole("article", { name: "Spring Carnival Kickoff" });
    expect(within(card).getByRole("button", { name: "Join waitlist" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Buy" })).toBeNull();
    expect(within(card).getByText("Sold out")).toBeInTheDocument();
  });

  it("story1_available_event_shows_buy_not_join_waitlist", () => {
    const store = createEventStore({
      events: [event({ capacity: 4 })],
      orders: [order({ seats: 3 })],
    });
    render(<EventList events={store.listUpcomingEvents(NOW)} />);
    const card = screen.getByRole("article", { name: "Spring Carnival Kickoff" });
    expect(within(card).getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Join waitlist" })).toBeNull();
    expect(within(card).getByText("1 seat left")).toBeInTheDocument();
  });

  it("story1_seeded_data_includes_a_sold_out_event_for_the_demo", async () => {
    const body = await (await GET()).json();
    expect(body.events.some((e: { sold_out: boolean }) => e.sold_out)).toBe(true);
    expect(body.events.some((e: { sold_out: boolean }) => !e.sold_out)).toBe(true);
  });
});
