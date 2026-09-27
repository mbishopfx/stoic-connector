import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BishopTech Relay — One team. Your agents.",
  description: "Give the agents you already use a shared brief, clear handoffs, and a place to report back.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
