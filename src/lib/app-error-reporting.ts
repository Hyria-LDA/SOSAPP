type AppErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type AppEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: AppErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    SOSAppEvents?: AppEvents;
  }
}

export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const payload = {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  };

  window.SOSAppEvents?.captureException?.(error, payload, {
    mechanism: "react_error_boundary",
    handled: false,
    severity: "error",
  });

  console.error("[app-error]", error, payload);
}
