"use client";

import { useState } from "react";

interface ToolMobileToggleProps {
  toolContent: React.ReactNode;
  chatContent: React.ReactNode;
}

export default function ToolMobileToggle({
  toolContent,
  chatContent,
}: ToolMobileToggleProps) {
  const [view, setView] = useState<"tool" | "chat">("tool");

  return (
    <>
      {/* Mobile toggle bar — below breadcrumb, only on < lg */}
      <div className="sticky top-[calc(3.5rem+2.625rem)] z-30 -mx-4 mb-6 border-b border-card-border bg-background/90 px-4 py-2 backdrop-blur-sm lg:hidden">
        <div className="flex rounded-lg bg-muted-bg p-1">
          <button
            type="button"
            onClick={() => setView("tool")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "tool"
                ? "bg-card-bg text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Tool Info
          </button>
          <button
            type="button"
            onClick={() => setView("chat")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "chat"
                ? "bg-card-bg text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Ask AI
          </button>
        </div>
      </div>

      {/* Desktop: 2-column grid */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">{toolContent}</div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="h-[600px] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
            {chatContent}
          </div>
        </div>
      </div>

      {/* Mobile: one view at a time */}
      <div className="lg:hidden">
        {view === "tool" ? (
          <div className="space-y-6">{toolContent}</div>
        ) : (
          <div
            className="-mx-4 -mb-8 flex flex-col bg-card-bg overflow-hidden"
            style={{ height: "calc(100dvh - 9rem)" }}
          >
            {chatContent}
          </div>
        )}
      </div>
    </>
  );
}
