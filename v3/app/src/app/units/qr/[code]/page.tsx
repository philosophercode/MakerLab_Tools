import { redirect, notFound } from "next/navigation";
import { fetchUnitByQrCode } from "@/lib/airtable";

export default async function QrRedirectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const unit = await fetchUnitByQrCode(code);

  if (!unit) {
    notFound();
  }

  // Redirect to the parent tool page (not the unit page)
  const toolId = unit.fields.tool?.[0];
  if (toolId) {
    redirect(`/tools/${toolId}`);
  }

  // Fallback: if unit has no linked tool, go to the unit page
  redirect(`/units/${unit.id}`);
}
