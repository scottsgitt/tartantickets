import { EventList } from "@/components/EventList";
import { eventStore } from "@/lib/events";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      <header className="page-header">
        <h1>Tartan Tickets</h1>
        <p>Upcoming club events</p>
      </header>
      <EventList events={eventStore.listUpcomingEvents()} />
    </main>
  );
}
