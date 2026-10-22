import { eventStore } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ events: eventStore.listUpcomingEvents() });
}
