/**
 * Custom event-driven Toast notification system to replace window.alert in iframe sandboxes.
 */

export type ToastType = "success" | "info" | "warning";

export interface ToastEventDetail {
  message: string;
  type: ToastType;
}

export function showToast(message: string, type: ToastType = "info") {
  const event = new CustomEvent("app-toast", {
    detail: { message, type }
  });
  window.dispatchEvent(event);
}
