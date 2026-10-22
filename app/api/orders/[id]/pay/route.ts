import { eventStore } from "@/lib/events";

export const dynamic = "force-dynamic";

// Simulated payment (HW3 scope): "approve" plays a successful card, "decline" a declined one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; name?: unknown } | null;
  const outcome = body?.outcome === "decline" ? "decline" : "approve";
  const name = typeof body?.name === "string" ? body.name : "";

  // SEC-6: someone else's order gets the exact same answer as an order that does not exist.
  const notFound = () =>
    Response.json({ error: "order_not_found", message: "We couldn't find that order." }, { status: 404 });
  if (!eventStore.orderBelongsTo(id, name)) return notFound();

  const result = eventStore.completePayment(id, outcome);
  if (result.ok) return Response.json(result);

  if (result.code === "order_not_found") return notFound();
  return Response.json(
    {
      error: "hold_expired",
      message: "Your 10-minute hold expired and the seats were released.",
      offer_waitlist: result.offer_waitlist,
    },
    { status: 409 },
  );
}
