"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { formatPrice, HOLD_MINUTES, MAX_SEATS_PER_ORDER } from "@/lib/checkout-rules";
import type { Receipt } from "@/lib/events";

type HeldOrder = { order_id: string; seats: number; hold_expires_at: string };
type Phase = "idle" | "starting" | "held" | "paying" | "paid" | "sold_out";

const holdFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

// Story 3 (Buy tickets). No real payments, sign-in or email in this version: the name is typed,
// payment is the "Simulated payment" button, and the receipt with its QR code is shown on screen.
export function EventActions({ eventId, soldOut, title }: { eventId: string; soldOut: boolean; title: string }) {
  const router = useRouter();
  const nameId = useId();
  const seatsId = useId();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("1");
  const [phase, setPhase] = useState<Phase>(soldOut ? "sold_out" : "idle");
  const [order, setOrder] = useState<HeldOrder | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!receipt) return;
    let cancelled = false;
    QRCode.toString(receipt.qr_token, { type: "svg", margin: 1, width: 160 })
      .then((svg) => {
        if (!cancelled) setQrSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }

  function showFailure(data: Record<string, unknown>) {
    setError(String(data.message ?? "Something went wrong. Please try again."));
    setPhase(data.offer_waitlist ? "sold_out" : "idle");
    router.refresh();
  }

  async function buy() {
    setError(null);
    setMessage(null);
    if (!name.trim()) {
      setError("Please type your name to buy tickets.");
      return;
    }
    const count = Number(seats);
    if (!Number.isInteger(count) || count < 1) {
      setError(`Choose between 1 and ${MAX_SEATS_PER_ORDER} tickets.`);
      return;
    }
    if (count > MAX_SEATS_PER_ORDER) {
      setError(`You can buy at most ${MAX_SEATS_PER_ORDER} tickets per order.`);
      return;
    }

    setPhase("starting");
    try {
      const { status, data } = await post("/api/orders", { event_id: eventId, name: name.trim(), seats: count });
      if (status === 201) {
        setOrder(data.order as HeldOrder);
        setPhase("held");
        router.refresh();
      } else {
        showFailure(data);
      }
    } catch {
      setError("We couldn't reach the server. Please try again.");
      setPhase("idle");
    }
  }

  async function pay(outcome: "approve" | "decline") {
    if (!order) return;
    setError(null);
    setPhase("paying");
    try {
      const { status, data } = await post(`/api/orders/${order.order_id}/pay`, { outcome, name: name.trim() });
      if (status !== 200) {
        showFailure(data);
      } else if (data.outcome === "paid") {
        setReceipt(data.receipt as Receipt);
        setPhase("paid");
        router.refresh();
      } else {
        setOrder(null);
        setMessage("Card declined. Your seats were released.");
        setPhase("idle");
        router.refresh();
      }
    } catch {
      setError("We couldn't reach the server. Please try again.");
      setPhase("held");
    }
  }

  if (phase === "paid" && receipt) {
    return (
      <div className="actions receipt">
        <h3>Your receipt</h3>
        <dl>
          <div>
            <dt>Event</dt>
            <dd>{receipt.event_title}</dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{receipt.buyer_name}</dd>
          </div>
          <div>
            <dt>Tickets</dt>
            <dd>{receipt.seats}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatPrice(receipt.total_cents)}</dd>
          </div>
          <div>
            <dt>Order number</dt>
            <dd>{receipt.order_id}</dd>
          </div>
        </dl>
        {qrSrc ? <img className="qr" src={qrSrc} width={160} height={160} alt="QR code for your tickets" /> : null}
        <p className="action-message" role="status">
          Payment received. Email receipts are not part of this demo, so your receipt and QR code are shown here.
        </p>
      </div>
    );
  }

  const busy = phase === "starting" || phase === "held" || phase === "paying";

  return (
    <div className="actions">
      {phase === "sold_out" ? (
        <button type="button" className="button secondary" onClick={() => setMessage(`Waitlist for "${title}" opens in a later release.`)}>
          Join waitlist
        </button>
      ) : (
        <>
          <div className="buy-form">
            <div className="field">
              <label htmlFor={nameId}>Your name</label>
              <input id={nameId} type="text" value={name} maxLength={60} disabled={busy} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field narrow">
              <label htmlFor={seatsId}>Tickets</label>
              <input id={seatsId} type="number" min={1} max={MAX_SEATS_PER_ORDER} value={seats} disabled={busy} onChange={(e) => setSeats(e.target.value)} />
            </div>
            <button type="button" className="button primary" disabled={busy} onClick={buy}>
              Buy
            </button>
          </div>
          {phase === "held" || phase === "paying" ? (
            <div className="checkout">
              <button type="button" className="button primary" disabled={phase === "paying"} onClick={() => pay("approve")}>
                Simulated payment
              </button>
              <button type="button" className="button secondary" disabled={phase === "paying"} onClick={() => pay("decline")}>
                Simulated decline
              </button>
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="action-message" role="status">
        {phase === "held" || phase === "paying"
          ? `Your ${order?.seats} ${order?.seats === 1 ? "seat is" : "seats are"} held for ${HOLD_MINUTES} minutes. Pay by ${holdFormat.format(new Date(order!.hold_expires_at))}.`
          : message}
      </p>
    </div>
  );
}
