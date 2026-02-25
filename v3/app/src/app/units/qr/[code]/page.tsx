import { redirect, notFound } from "next/navigation";
import { fetchUnitByQrCode } from "@/lib/airtable";

/**
 * QR code scan → resolve unit → redirect to parent tool page.
 * Falls back to /units/:id redirect if no direct tool link.
 */
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

  // Redirect straight to the parent tool page when possible
  const toolId = unit.fields.tool?.[0];
  if (toolId) {
    redirect(`/tools/${toolId}`);
  }

  // Fallback: go through unit redirect
  redirect(`/units/${unit.id}`);
}
