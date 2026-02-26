import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DFS Football League",
  description: "DraftKings fantasy football league dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
