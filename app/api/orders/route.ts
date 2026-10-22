import { eventStore, HOLD_MINUTES } from "@/lib/events";

export const dynamic = "force-dynamic";

const MESSAGES = {
  name_required: "Please type your name to buy tickets.",
  invalid_seats: "Choose between 1 and 4 tickets.",
  over_limit: "You can buy at most 4 tickets per order.",
  event_not_found: "We couldn't find that event.",
  rate_limited: "Too many checkouts for this event. Please try again later.",
  sold_out: "This event just sold out.",
} as const;

const STATUS = {
  name_required: 401,
  invalid_seats: 400,
  over_limit: 400,
  event_not_found: 404,
  rate_limited: 429,
  sold_out: 409,
  not_enough_seats: 409,
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_seats", message: MESSAGES.invalid_seats }, { status: 400 });
  }

  // Only these three fields are read. Any price or total in the body is ignored (SEC-8).
  const { event_id, name, seats } = body as { event_id?: unknown; name?: unknown; seats?: unknown };
  const result = eventStore.startCheckout({
    eventId: String(event_id ?? ""),
    name: typeof name === "string" ? name : "",
    seats: typeof seats === "number" ? seats : Number.NaN,
  });

  if (result.ok) {
    return Response.json({ order: result.order, hold_minutes: HOLD_MINUTES }, { status: 201 });
  }

  const message =
    result.code === "not_enough_seats"
      ? result.seats_remaining === 1
        ? "Only 1 seat is left."
        : `Only ${result.seats_remaining} seats are left.`
      : MESSAGES[result.code];
  return Response.json(
    { error: result.code, message, offer_waitlist: result.code === "sold_out" },
    { status: STATUS[result.code] },
  );
}
