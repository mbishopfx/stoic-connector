import { redirect } from "next/navigation";
import { serverAuth } from "@/lib/supabase";
import { StoicDashboard } from "@/components/relay-dashboard";

export default async function DashboardPage() {
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <StoicDashboard email={data.user.email || ""} />;
}
