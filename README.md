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
