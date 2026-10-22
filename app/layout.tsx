import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tartan Tickets",
  description: "Browse and buy tickets for CMU club events.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
