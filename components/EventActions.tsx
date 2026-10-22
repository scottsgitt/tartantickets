"use client";

import { useState } from "react";

// Buying (Story 3) and the waitlist (Story 4) are not built yet, so the
// buttons only say so. This story is about showing the right button.
export function EventActions({ soldOut, title }: { soldOut: boolean; title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="actions">
      {soldOut ? (
        <button type="button" className="button secondary" onClick={() => setMessage(`Waitlist for "${title}" opens in a later release.`)}>
          Join waitlist
        </button>
      ) : (
        <button type="button" className="button primary" onClick={() => setMessage(`Checkout for "${title}" opens in a later release.`)}>
          Buy
        </button>
      )}
      <p className="action-message" role="status">
        {message}
      </p>
    </div>
  );
}
