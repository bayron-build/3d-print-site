import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-800"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
