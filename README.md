# Tartan Tickets

A club event ticketing web app (Next.js). This version builds **Story 1: Browse events** and **Story 3: Buy tickets** from `docs/requirements.md`.

## Run it

```
npm install
npm run dev      # http://localhost:3000
npm test
npm run build
```

## Non-goals (HW3 scope)

- **Real payments.** There is no Stripe or card handling. The "Simulated payment" button plays a successful card and "Simulated decline" plays a declined one.
- **Real authentication.** There is no SSO or sign-in provider. A buyer is just a name typed into a text box, so it proves nothing about who they are.
- **Real email.** The spec asks for an emailed receipt with a QR code. There is no email service, so the receipt and QR code are shown on screen after payment.
- **A database.** Events, orders, and seat holds live in memory on the server. **All data resets every time the server restarts or the app is deployed.**
- **Waitlist.** Story 4 is not built. "Join waitlist" appears for sold-out events but only shows a message.

## Notes on Story 3

- An order is capped at 4 seats and starts a 10-minute seat hold. Held seats come back if the hold runs out or the card is declined.
- The server calculates the price from the stored event price. Any price sent by the browser is ignored.
- More than 5 checkouts for one event by the same name within 10 minutes blocks that name for 30 minutes.
- `POST /api/orders/{id}/pay` is an addition to the API contract in the spec, needed to drive the simulated payment.

## Security spec audit

Checked against `docs/SECURITY_SPEC.md` for the build as of the "Build story 3: Buy tickets" commit. Only Stories 1 and 3 exist, with a typed name, simulated payment and in-memory data (see Non-goals), so most of this spec is not met yet.

| Req | Satisfied? | Why |
|---|---|---|
| SEC-1 | Not at all | There is no SSO. A buyer is a name typed into a text box, and no passwords are stored because there are no accounts. |
| SEC-2 | Not at all | There are no sessions, so nothing expires after 8 hours. |
| SEC-3 | Not at all | The app sets no HTTPS redirect or HSTS header, and local dev runs on plain HTTP. The host may add them, but that is unchecked. |
| SEC-4 | Not at all | There are no roles or clubs to check. The server only validates inputs (name, seat count, event) on each request. |
| SEC-5 | Not at all | There is no club authorization, no access-denied response and no logging. |
| SEC-6 | Partly | Paying for or declining an order now needs the name typed at checkout. A wrong or missing name gets the exact same "not found" answer as an order that does not exist (`someone who did not place an order gets the same not-found answer as for an order that does not exist`). Still missing: the name is not proof of identity, so anyone who types the buyer's name can act on their order. There is also no way to read an order or ticket yet. |
| SEC-7 | Partly | No card data is collected, stored or logged, but only because payment is simulated. Stripe Checkout is not used. |
| SEC-8 | Fully | The server computes the total from the stored price and seat count and ignores any amount from the browser (`story3_tampered_client_price_is_ignored_sec8`). |
| SEC-9 | Not at all | There is no Stripe webhook endpoint, so no signature is verified. |
| SEC-10 | Partly | Paying the same order twice returns the same ticket, not a second one. There are no Stripe event IDs yet. |
| SEC-11 | Fully | There are no keys or secrets in the repository, and nothing needs one. |
| SEC-12 | Not at all | There are no club Stripe accounts or approval flow. |
| SEC-13 | Partly | The QR token is 128 random bits with no personal information. There is no server-side lookup of it yet, because check-in (Story 6) is not built. |
| SEC-14 | Not at all | There is no check-in or scanning. |
| SEC-15 | Not at all | There is no scanning, so no invalid-scan limit. |
| SEC-16 | Partly | More than 5 checkouts for one event in 10 minutes blocks that name for 30 minutes. The "account" is a typed name, so a buyer can get around it by typing a different one. |
| SEC-17 | Partly | Each order stores only the typed name, seat count, total, status and IDs. There is no Andrew email or Stripe payment ID, and it keeps the seat count and total, which the spec does not list. |
| SEC-18 | Not at all | There is no 90-day cleanup. Data lives in memory and is lost on every restart or deploy. |
| SEC-19 | Not at all | There is no attendee export. |
| SEC-20 | Fully | Event text is rendered by React as plain text, so a script tag shows as text (`story1_event_text_rendered_as_plain_text`). No officer can enter text yet. |
| SEC-21 | Not at all | There is no audit log, and none of the listed actions exist yet. |
| SEC-22 | Not at all | There is no audit log to protect. |

**Summary:** 3 fully (SEC-8, SEC-11, SEC-20), 6 partly (SEC-6, SEC-7, SEC-10, SEC-13, SEC-16, SEC-17), 13 not at all.
