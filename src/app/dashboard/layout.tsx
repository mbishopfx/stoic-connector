import { IBM_Plex_Sans, Merriweather } from "next/font/google";
import { cn } from "@/lib/utils";

const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans" });
const merriweatherHeading = Merriweather({ subsets: ["latin"], variable: "--font-heading" });

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={cn("dashboard-font-scope font-sans", ibmPlexSans.variable, merriweatherHeading.variable)}>{children}</div>;
}
