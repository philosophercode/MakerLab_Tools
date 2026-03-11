"use client";

import { useState } from "react";
import type { UIMessage } from "ai";

interface FeedbackWidgetProps {
  solutionSummary: string;
  messages: UIMessage[];
  toolId?: string;
}

export default function FeedbackWidget({
  solutionSummary,
  messages,
  toolId,
}: FeedbackWidgetProps) {
  const [state, setState] = useState<"idle" | "submitting" | "submitted" | "dismissed">("idle");

  if (state === "dismissed" || state === "submitted") {
    if (state === "submitted") {
      return (
        <div className="mx-auto max-w-xs rounded-lg border border-accent-teal/20 bg-accent-teal/5 px-4 py-2 text-center text-xs text-muted animate-in fade-in">
          Thanks for your feedback!
        </div>
      );
    }
    return null;
  }

  const handleYes = async () => {
    setState("submitting");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          solutionSummary,
          toolId,
        }),
      });
      if (!res.ok) throw new Error("Feedback submission failed");
      setState("submitted");
    } catch {
      // Silently fail — don't interrupt the user's experience
      setState("submitted");
    }
  };

  const handleNo = () => {
    setState("dismissed");
  };

  return (
    <div className="mx-auto max-w-xs rounded-lg border border-card-border bg-muted-bg/50 px-4 py-3 text-center">
      <p className="mb-2 text-xs text-muted">Did this help?</p>
      <div className="flex justify-center gap-3">
        <button
          onClick={handleYes}
          disabled={state === "submitting"}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent-teal/30 bg-accent-teal/10 px-3 py-1 text-xs text-accent-teal transition-colors hover:bg-accent-teal/20 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Yes
        </button>
        <button
          onClick={handleNo}
          disabled={state === "submitting"}
          className="inline-flex items-center gap-1.5 rounded-full border border-card-border px-3 py-1 text-xs text-muted transition-colors hover:bg-muted-bg hover:text-foreground disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          No
        </button>
      </div>
    </div>
  );
}
