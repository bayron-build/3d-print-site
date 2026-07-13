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
// for done, red for rejected.
export const STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  received: "bg-gray-100 text-gray-800",
  quoted: "bg-blue-100 text-blue-800",
  approved: "bg-indigo-100 text-indigo-800",
  printing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}
