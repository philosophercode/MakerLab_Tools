import type { UnitRecord } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  Available: "bg-success/10 text-success",
  "In Use": "bg-warning/10 text-warning",
  "Under Maintenance": "bg-cornell-red/10 text-cornell-red",
  "Out of Service": "bg-danger/10 text-danger",
  Retired: "bg-muted-bg text-muted",
};

export default function UnitStatusTable({ units }: { units: UnitRecord[] }) {
  if (units.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted">
        Units ({units.length})
      </h3>
      <div className="overflow-x-auto rounded-lg border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-muted-bg/50">
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                Unit
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted">
                Condition
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr
                key={unit.id}
                className="border-b border-card-border last:border-0"
              >
                <td className="px-3 py-2 font-medium">
                  {unit.fields.unit_label}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[unit.fields.status || ""] || "bg-muted-bg text-muted"
                    }`}
                  >
                    {unit.fields.status || "Unknown"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">
                  {unit.fields.condition || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <a
                    href={`/units/${unit.id}`}
                    className="text-xs text-cornell-red hover:underline"
                  >
                    Details
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
