// Toasts confirm a finished task without moving the page. Any module
// can call toast.success(title, message); the Toaster in the staff
// layout renders them.

export const TOAST_MS = 6000;
const MAX_TOASTS = 4;

let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

export function dismissToast(id) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function showToast(tone, title, message = "") {
  const id = nextId;

  nextId += 1;
  toasts = [...toasts, { id, message, title, tone }].slice(-MAX_TOASTS);
  emit();

  return id;
}

export const toast = {
  dismiss: dismissToast,
  error: (title, message) => showToast("error", title, message),
  info: (title, message) => showToast("info", title, message),
  success: (title, message) => showToast("success", title, message),
  warning: (title, message) => showToast("warning", title, message),
};
