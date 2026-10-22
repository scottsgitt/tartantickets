"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <p className="empty" role="alert">
        We couldn&apos;t load events. Please try again.
      </p>
      <button type="button" className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
