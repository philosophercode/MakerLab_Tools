"use client";

import { useState } from "react";
import type { UnitRecord } from "@/lib/types";

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

export default function UnitsSection({ units }: { units: UnitRecord[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (units.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted">
        Units ({units.length})
      </h2>
      <div className="space-y-2">
        {units.map((unit) => {
          const f = unit.fields;
          const isOpen = expanded.has(unit.id);
          const statusColor =
            STATUS_COLORS[f.status || ""] || "bg-muted-bg text-muted";
          const conditionColor =
            CONDITION_COLORS[f.condition || ""] || "text-muted";

          return (
            <div
              key={unit.id}
              className="rounded-lg border border-card-border overflow-hidden"
            >
              {/* Collapsed header — always visible */}
              <button
                type="button"
                onClick={() => toggle(unit.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted-bg/50 transition-colors"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {f.unit_label}
                  </span>
                  <span
                    className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
                  >
                    {f.status || "Unknown"}
                  </span>
                </div>
                <svg
                  className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div className="border-t border-card-border px-3 py-3 space-y-3">
                  {/* Condition */}
                  {f.condition && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Condition</span>
                      <span className={`font-medium ${conditionColor}`}>
                        {f.condition}
                      </span>
                    </div>
                  )}

                  {/* Serial number */}
                  {f.serial_number && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Serial Number</span>
                      <span className="font-mono text-xs">
                        {f.serial_number}
                      </span>
                    </div>
                  )}

                  {/* Asset tag */}
                  {f.asset_tag && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Asset Tag</span>
                      <span className="font-mono text-xs">{f.asset_tag}</span>
                    </div>
                  )}

                  {/* Acquired date */}
                  {f.date_acquired && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Acquired</span>
                      <span>
                        {new Date(f.date_acquired).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {/* QR Code */}
                  {f.qr_code_id && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">QR Code ID</span>
                      <span className="font-mono text-xs">{f.qr_code_id}</span>
                    </div>
                  )}

                  {/* Notes */}
                  {f.notes && (
                    <div className="rounded-lg bg-muted-bg/50 p-2.5">
                      <span className="block text-xs font-medium text-muted mb-1">
                        Notes
                      </span>
                      <p className="text-sm whitespace-pre-wrap">{f.notes}</p>
                    </div>
                  )}

                  {/* Report Issue */}
                  <a
                    href={`/report?unit=${unit.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cornell-red px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-cornell-dark"
                  >
                    Report an Issue
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
