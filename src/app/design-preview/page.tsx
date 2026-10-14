import { notFound } from "next/navigation";
import { StoicDashboard } from "@/components/relay-dashboard";
import { designPreviewState } from "@/lib/design-preview-fixture";

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <StoicDashboard email="preview@stoic.local" previewState={designPreviewState} previewMode />;
}
