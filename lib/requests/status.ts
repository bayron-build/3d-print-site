// The request status vocabulary, shared across the admin list, detail page,
// and quote validation. Dutch labels for the UI; English identifiers in code.
// Phase 5 reuses this when status changes trigger customer emails.

export const REQUEST_STATUSES = [
  "received",
  "quoted",
  "approved",
  "printing",
  "done",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  received: "Ontvangen",
  quoted: "Offerte gestuurd",
  approved: "Akkoord",
  printing: "Wordt geprint",
  done: "Afgerond",
  rejected: "Afgewezen",
};

// Badge colours per status: neutral for new, blue while in progress, green
// for done, red for rejected. Violet marks the customer's "akkoord" moment.
// The dark: variants render inside the always-dark admin shell.
export const STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  received: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  approved: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  printing: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  done: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

// Solid dot variant of the same scheme, for the admin dashboard filter cards.
export const STATUS_DOT_CLASSES: Record<RequestStatus, string> = {
  received: "bg-slate-400",
  quoted: "bg-blue-500",
  approved: "bg-violet-500",
  printing: "bg-amber-500",
  done: "bg-green-500",
  rejected: "bg-red-500",
};

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}
