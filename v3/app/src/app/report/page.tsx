import { Suspense } from "react";
import { fetchAllUnits, fetchAllTools } from "@/lib/airtable";
import MaintenanceForm from "@/components/MaintenanceForm";

export const revalidate = 300;

export const metadata = {
  title: "Report Issue — MakerLab Tools",
  description: "Report a maintenance issue with MakerLab equipment.",
};

export default async function ReportPage() {
  // Fetch units + tools to build a searchable unit list
  let unitOptions: { id: string; label: string; toolName?: string }[] = [];

  try {
    const [units, tools] = await Promise.all([
      fetchAllUnits(),
      fetchAllTools(),
    ]);

    const toolMap = new Map(tools.map((t) => [t.id, t.fields.name]));

    unitOptions = units.map((u) => ({
      id: u.id,
      label: u.fields.unit_label,
      toolName: u.fields.tool?.[0] ? toolMap.get(u.fields.tool[0]) : undefined,
    }));
  } catch {
    // Continue with empty unit list — form still works without it
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Report an Issue</h1>
        <p className="mt-1 text-sm text-muted">
          Report equipment problems, request maintenance, or log an inspection.
        </p>
      </div>
      <div className="rounded-xl border border-card-border bg-card-bg p-6">
        <Suspense fallback={<div className="py-8 text-center text-muted text-sm">Loading form...</div>}>
          <MaintenanceForm units={unitOptions} />
        </Suspense>
      </div>
    </div>
  );
}
