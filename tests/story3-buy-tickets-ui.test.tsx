// Story 3: Buy tickets (what the student sees and clicks)
// AC1: cap the order at 4 seats. AC2: hold the seats for 10 minutes.
// AC3: payment succeeds -> receipt with a QR code (shown on screen in HW3).
// AC4: card declined -> seats released. AC5: sells out during checkout -> offer the waitlist.
// UX spec: the Buy button is disabled after one click to prevent double orders.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventActions } from "@/components/EventActions";

type FakeResponse = { status: number; body: unknown };

function respond({ status, body }: FakeResponse): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(...responses: FakeResponse[]) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(respond(r));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const HELD_ORDER = {
  order_id: "ord-test",
  event_id: "e1",
  seats: 2,
  status: "held",
  total_cents: 3000,
  hold_expires_at: "2026-10-22T12:10:00.000Z",
};

const RECEIPT = {
  order_id: "ord-test",
  event_title: "Spring Carnival Kickoff",
  buyer_name: "Andrew",
  seats: 2,
  total_cents: 3000,
  qr_token: "0123456789abcdef0123456789abcdef",
};

function renderCard() {
  render(<EventActions eventId="e1" soldOut={false} title="Spring Carnival Kickoff" />);
}

function fillAndBuy(name = "Andrew", tickets = "2") {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Tickets"), { target: { value: tickets } });
  fireEvent.click(screen.getByRole("button", { name: "Buy" }));
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("Story 3 UI: before buying", () => {
  it("story3_ui_buy_needs_a_typed_name", () => {
    const fetchMock = stubFetch();
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please type your name to buy tickets.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("story3_ui_more_than_4_tickets_shows_the_limit_and_does_not_call_the_server", () => {
    const fetchMock = stubFetch();
    renderCard();
    fillAndBuy("Andrew", "5");
    expect(screen.getByRole("alert")).toHaveTextContent("You can buy at most 4 tickets per order.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("story3_ui_buy_button_is_disabled_after_one_click", () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();
    fillAndBuy();
    const buy = screen.getByRole("button", { name: "Buy" });
    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Story 3 UI: holding, paying, declining", () => {
  it("story3_ui_starting_checkout_shows_the_hold_and_payment_buttons", async () => {
    const fetchMock = stubFetch({ status: 201, body: { order: HELD_ORDER } });
    renderCard();
    fillAndBuy();

    expect(await screen.findByRole("button", { name: "Simulated payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulated decline" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your 2 seats are held for 10 minutes.");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/orders");
    expect(JSON.parse(init.body)).toEqual({ event_id: "e1", name: "Andrew", seats: 2 });
  });

  it("story3_ui_simulated_payment_shows_the_receipt_with_a_qr_code", async () => {
    stubFetch({ status: 201, body: { order: HELD_ORDER } }, { status: 200, body: { outcome: "paid", receipt: RECEIPT } });
    renderCard();
    fillAndBuy();
    fireEvent.click(await screen.findByRole("button", { name: "Simulated payment" }));

    expect(await screen.findByRole("heading", { name: "Your receipt" })).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("ord-test")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "QR code for your tickets" })).toBeInTheDocument();
  });

  it("story3_ui_declined_card_releases_the_seats_and_lets_you_buy_again", async () => {
    stubFetch({ status: 201, body: { order: HELD_ORDER } }, { status: 200, body: { outcome: "declined" } });
    renderCard();
    fillAndBuy();
    fireEvent.click(await screen.findByRole("button", { name: "Simulated decline" }));

    expect(await screen.findByText("Card declined. Your seats were released.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Simulated payment" })).toBeNull();
  });

  it("story3_ui_payment_after_the_hold_expires_says_so", async () => {
    stubFetch(
      { status: 201, body: { order: HELD_ORDER } },
      { status: 409, body: { error: "hold_expired", message: "Your 10-minute hold expired.", offer_waitlist: false } },
    );
    renderCard();
    fillAndBuy();
    fireEvent.click(await screen.findByRole("button", { name: "Simulated payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your 10-minute hold expired.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled());
  });
});

describe("Story 3 UI: selling out during checkout", () => {
  it("story3_ui_sold_out_during_checkout_offers_the_waitlist", async () => {
    stubFetch({ status: 409, body: { error: "sold_out", message: "This event just sold out.", offer_waitlist: true } });
    renderCard();
    fillAndBuy();

    expect(await screen.findByRole("alert")).toHaveTextContent("This event just sold out.");
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
  });

  it("story3_ui_server_limit_message_is_shown_and_buy_is_enabled_again", async () => {
    stubFetch({ status: 409, body: { error: "not_enough_seats", message: "Only 1 seat is left.", offer_waitlist: false } });
    renderCard();
    fillAndBuy("Andrew", "3");

    expect(await screen.findByRole("alert")).toHaveTextContent("Only 1 seat is left.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled());
  });
});
