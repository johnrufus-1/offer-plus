import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Club Royale Finder",
  description: "Search your Royal Caribbean casino offers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
