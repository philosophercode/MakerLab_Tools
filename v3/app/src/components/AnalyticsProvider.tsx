"use client";

import { createContext, useContext, useCallback, useRef, useEffect } from "react";

interface AnalyticsEvent {
  event_type: string;
  tool_id?: string;
  detail?: string;
  session_id?: string;
}

interface AnalyticsContextValue {
  trackEvent: (type: string, toolId?: string, detail?: string) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  trackEvent: () => {},
});

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

function getSessionId(): string {
  const KEY = "makerlab-session-id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queueRef = useRef<AnalyticsEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, 10);
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Analytics should never break the app
    }

    // If there are remaining events, flush again
    if (queueRef.current.length > 0) {
      flush();
    }
  }, []);

  const trackEvent = useCallback(
    (type: string, toolId?: string, detail?: string) => {
      const event: AnalyticsEvent = {
        event_type: type,
        tool_id: toolId,
        detail: detail?.slice(0, 200),
        session_id: getSessionId(),
      };

      queueRef.current.push(event);

      // Cap queue at 50 events
      if (queueRef.current.length > 50) {
        queueRef.current = queueRef.current.slice(-50);
      }
    },
    []
  );

  useEffect(() => {
    // Flush every 30 seconds
    timerRef.current = setInterval(flush, 30_000);

    // Flush on page hide (tab switch, close)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, [flush]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
