import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Querion",
    template: "%s · Querion",
  },
  description: "A private archive of pi coding-agent sessions.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1e1e2e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-base text-fg antialiased">{children}</body>
    </html>
  );
}
