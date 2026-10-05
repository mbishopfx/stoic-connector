import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stoic Connector — One brief. Every agent.",
  description: "Stoic gives the agents you already use a shared brief, clear handoffs, and a place to report back.",
  applicationName: "Stoic Connector",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="stoic-theme"><TooltipProvider>{children}</TooltipProvider></ThemeProvider></body></html>;
}
