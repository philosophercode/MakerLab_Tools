import { redirect, notFound } from "next/navigation";
import { fetchUnit } from "@/lib/airtable";

/**
 * Unit pages now live as an expandable section on the tool page.
 * This route redirects old /units/:id links to the parent tool.
 */
export default async function UnitRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let unit;
  try {
    unit = await fetchUnit(id);
  } catch {
    notFound();
  }

  if (!unit) notFound();

  const toolId = unit.fields.tool?.[0];
  if (toolId) {
    redirect(`/tools/${toolId}`);
  }

  // Fallback: no parent tool linked — go home
  redirect("/");
}
