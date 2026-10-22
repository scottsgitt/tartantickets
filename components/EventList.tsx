import { formatEventDate, formatPrice, type EventSummary } from "@/lib/events";
import { EventActions } from "./EventActions";

function seatsLabel(event: EventSummary): string {
  if (event.sold_out) return "Sold out";
  return event.seats_remaining === 1 ? "1 seat left" : `${event.seats_remaining} seats left`;
}

export function EventList({ events }: { events: EventSummary[] }) {
  if (events.length === 0) {
    return <p className="empty">No upcoming events yet.</p>;
  }

  return (
    <ul className="event-list">
      {events.map((event) => {
        const headingId = `event-${event.event_id}-title`;
        return (
          <li key={event.event_id}>
            <article className="event-card" aria-labelledby={headingId}>
              <h2 id={headingId}>{event.title}</h2>
              <dl>
                <div>
                  <dt>Date</dt>
                  <dd>
                    <time dateTime={event.starts_at}>{formatEventDate(event.starts_at)}</time>
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{event.location}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>{formatPrice(event.price_cents)}</dd>
                </div>
                <div>
                  <dt>Seats</dt>
                  <dd className={event.sold_out ? "sold-out" : undefined}>{seatsLabel(event)}</dd>
                </div>
              </dl>
              <EventActions eventId={event.event_id} soldOut={event.sold_out} title={event.title} />
            </article>
          </li>
        );
      })}
    </ul>
  );
}
