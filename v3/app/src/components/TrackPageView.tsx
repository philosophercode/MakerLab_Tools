"use client";

import { useEffect } from "react";
import { useAnalytics } from "@/components/AnalyticsProvider";

export default function TrackPageView({ toolId }: { toolId: string }) {
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    trackEvent("page_view", toolId);
  }, [trackEvent, toolId]);

  return null;
}
