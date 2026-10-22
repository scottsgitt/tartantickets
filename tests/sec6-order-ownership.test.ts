// SEC-6: If a user requests a ticket that belongs to another student, then the system shall
// return "not found" without revealing that the ticket exists.
// HW3 scope: there is no sign-in, so "the user" is the name typed at checkout.
import { describe, it, expect } from "vitest";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as payOrder } from "@/app/api/orders/[id]/pay/route";

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function placeOrder(name: string): Promise<string> {
  const response = await createOrder(post("/api/orders", { event_id: "evt-hackathon", name, seats: 1 }));
  return (await response.json()).order.order_id;
}

function pay(id: string, body: unknown) {
  return payOrder(post(`/api/orders/${id}/pay`, body), { params: Promise.resolve({ id }) });
}

describe("SEC-6: another student's order looks like it does not exist", () => {
  it("someone who did not place an order gets the same not-found answer as for an order that does not exist", async () => {
    const id = await placeOrder("Alice Owner");

    const wrongPerson = await pay(id, { outcome: "approve", name: "Bob Intruder" });
    const missingOrder = await pay("ord-does-not-exist", { outcome: "approve", name: "Bob Intruder" });

    expect(wrongPerson.status).toBe(404);
    expect(missingOrder.status).toBe(404);
    expect(await wrongPerson.json()).toEqual(await missingOrder.json());
  });

  it("an order cannot be paid or cancelled without saying whose order it is", async () => {
    const id = await placeOrder("Carol Owner");
    expect((await pay(id, { outcome: "approve" })).status).toBe(404);
    expect((await pay(id, { outcome: "decline" })).status).toBe(404);
  });

  it("a failed attempt by someone else leaves the real owner's order untouched", async () => {
    const id = await placeOrder("Dana Owner");
    await pay(id, { outcome: "decline", name: "Eve Intruder" });

    const ownerPays = await pay(id, { outcome: "approve", name: "Dana Owner" });
    expect(ownerPays.status).toBe(200);
    expect((await ownerPays.json()).outcome).toBe("paid");
  });

  it("the owner can still pay when they type their name with different capitals or extra spaces", async () => {
    const id = await placeOrder("Frank Owner");
    const response = await pay(id, { outcome: "approve", name: "  frank OWNER " });
    expect(response.status).toBe(200);
  });
});
