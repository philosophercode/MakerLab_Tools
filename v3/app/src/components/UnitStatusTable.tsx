"use client";

import { useState } from "react";
import type { UnitRecord, MaintenanceLogRecord } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  Available: "bg-success/10 text-success",
  "In Use": "bg-warning/10 text-warning",
  "Under Maintenance": "bg-cornell-red/10 text-cornell-red",
  "Out of Service": "bg-danger/10 text-danger",
  Retired: "bg-muted-bg text-muted",
};

const CONDITION_COLORS: Record<string, string> = {
  Excellent: "text-success",
  Good: "text-foreground",
  Fair: "text-warning",
  "Needs Repair": "text-danger",
};

const LOG_PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-danger/10 text-danger",
  High: "bg-warning/10 text-warning",
  Medium: "bg-muted-bg text-muted",
  Low: "bg-muted-bg text-muted",
};

interface UnitStatusTableProps {
  units: UnitRecord[];
  maintenanceLogs?: MaintenanceLogRecord[];
}

export default function UnitStatusTable({
  units,
  maintenanceLogs = [],
}: UnitStatusTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (units.length === 0) return null;

  // Group logs by unit ID for fast lookup
  const logsByUnit = new Map<string, MaintenanceLogRecord[]>();
  for (const log of maintenanceLogs) {
    const unitId = log.fields.unit?.[0];
    if (unitId) {
      const existing = logsByUnit.get(unitId) || [];
      existing.push(log);
      logsByUnit.set(unitId, existing);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted">
        Units ({units.length})
      </h3>
      <div className="overflow-x-auto rounded-lg border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-muted-bg/50">
              <th
                scope="col"
                className="px-3 py-2 text-left font-medium text-muted"
              >
                Unit
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left font-medium text-muted"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left font-medium text-muted"
              >
                Condition
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-medium text-muted"
              >
                <span className="sr-only">Toggle details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => {
              const isExpanded = expandedId === unit.id;
              const unitLogs = logsByUnit.get(unit.id) || [];
              const openLogs = unitLogs.filter(
                (l) =>
                  l.fields.status === "Open" ||
                  l.fields.status === "In Progress"
              );

              return (
                <tr
                  key={unit.id}
                  className="border-b border-card-border last:border-0"
                >
                  <td colSpan={4} className="p-0">
                    {/* Main row */}
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : unit.id)
                      }
                      className="flex w-full items-center text-left hover:bg-muted-bg/30 transition-colors"
                    >
                      <span className="flex-1 px-3 py-2 font-medium">
                        {unit.fields.unit_label}
                        {openLogs.length > 0 && (
                          <span className="ml-2 inline-block rounded-full bg-cornell-red/10 px-1.5 py-0.5 text-xs font-medium text-cornell-red">
                            {openLogs.length} open{" "}
                            {openLogs.length === 1 ? "issue" : "issues"}
                          </span>
                        )}
                      </span>
                      <span className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[unit.fields.status || ""] ||
                            "bg-muted-bg text-muted"
                          }`}
                        >
                          {unit.fields.status || "Unknown"}
                        </span>
                      </span>
                      <span className="px-3 py-2 text-muted">
                        {unit.fields.condition || "—"}
                      </span>
                      <span className="px-3 py-2 text-xs text-muted">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-card-border bg-muted-bg/20 px-4 py-3 space-y-3">
                        {/* Unit metadata */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          {unit.fields.serial_number && (
                            <div className="flex justify-between">
                              <span className="text-muted">Serial</span>
                              <span className="font-mono text-xs">
                                {unit.fields.serial_number}
                              </span>
                            </div>
                          )}
                          {unit.fields.asset_tag && (
                            <div className="flex justify-between">
                              <span className="text-muted">Asset Tag</span>
                              <span className="font-mono text-xs">
                                {unit.fields.asset_tag}
                              </span>
                            </div>
                          )}
                          {unit.fields.date_acquired && (
                            <div className="flex justify-between">
                              <span className="text-muted">Acquired</span>
                              <span>
                                {new Date(
                                  unit.fields.date_acquired
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>

                        {unit.fields.notes && (
                          <div className="text-sm">
                            <span className="text-muted">Notes: </span>
                            <span className="whitespace-pre-wrap">
                              {unit.fields.notes}
                            </span>
                          </div>
                        )}

                        {/* Maintenance logs for this unit */}
                        {unitLogs.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-muted mb-1.5">
                              Maintenance History
                            </h4>
                            <div className="space-y-1.5">
                              {unitLogs.slice(0, 5).map((log) => (
                                <div
                                  key={log.id}
                                  className="flex items-start justify-between rounded border border-card-border bg-card-bg px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">
                                      {log.fields.title}
                                    </p>
                                    {log.fields.description && (
                                      <p className="mt-0.5 text-xs text-muted line-clamp-1">
                                        {log.fields.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="ml-3 flex shrink-0 items-center gap-2 text-xs">
                                    {log.fields.priority && (
                                      <span
                                        className={`rounded-full px-2 py-0.5 font-medium ${
                                          LOG_PRIORITY_COLORS[
                                            log.fields.priority
                                          ] || "bg-muted-bg text-muted"
                                        }`}
                                      >
                                        {log.fields.priority}
                                      </span>
                                    )}
                                    <span
                                      className={
                                        log.fields.status === "Open" ||
                                        log.fields.status === "In Progress"
                                          ? "font-medium text-cornell-red"
                                          : "text-muted"
                                      }
                                    >
                                      {log.fields.status || "Unknown"}
                                    </span>
                                    {log.fields.date_reported && (
                                      <span className="text-muted">
                                        {new Date(
                                          log.fields.date_reported
                                        ).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {unitLogs.length > 5 && (
                                <p className="text-xs text-muted">
                                  + {unitLogs.length - 5} more
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Report issue link */}
                        <a
                          href={`/report?unit=${unit.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cornell-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cornell-dark"
                        >
                          Report an Issue
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
