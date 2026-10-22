// SEC-6 (browser side): the page tells the server whose order it is paying for.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventActions } from "@/components/EventActions";

afterEach(() => vi.unstubAllGlobals());

describe("SEC-6: the page says whose order it is when paying", () => {
  it("clicking Simulated payment sends the typed name along with the order", async () => {
    const held = { order_id: "ord-1", event_id: "e1", seats: 1, hold_expires_at: "2026-10-22T12:10:00.000Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ order: held }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcome: "declined" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<EventActions eventId="e1" soldOut={false} title="Any Event" />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Grace Hopper " } });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulated decline" }));
    await screen.findByText("Card declined. Your seats were released.");

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/orders/ord-1/pay");
    expect(JSON.parse(init.body)).toEqual({ outcome: "decline", name: "Grace Hopper" });
  });
});
