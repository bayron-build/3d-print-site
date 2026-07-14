import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { countByStatus } from "@/lib/requests/counts";
import { formatRequestDate } from "@/lib/requests/dates";
import {
  isRequestStatus,
  REQUEST_STATUSES,
  STATUS_DOT_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { status } = await searchParams;
  const activeFilter =
    typeof status === "string" && isRequestStatus(status) ? status : null;

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select("id, created_at, customer_name, email, type, quantity, status")
    .order("created_at", { ascending: false });
  if (activeFilter) {
    query = query.eq("status", activeFilter);
  }
  // Counts stay accurate under any filter: one cheap status-only query.
  const [{ data: requests, error }, { data: statusRows }] = await Promise.all([
    query,
    supabase.from("requests").select("status"),
  ]);
  const counts = countByStatus(statusRows ?? []);
  const total = (statusRows ?? []).length;

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Aanvragen</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {requests?.length ?? 0}{" "}
        {requests?.length === 1 ? "aanvraag" : "aanvragen"}
        {activeFilter ? ` met status “${STATUS_LABELS[activeFilter]}”` : ""}
      </p>

      {/* Filter cards double as the status overview (spec). */}
      <nav className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <FilterCard
          label="Alle"
          count={total}
          href="/admin"
          active={activeFilter === null}
        />
        {REQUEST_STATUSES.map((s) => (
          <FilterCard
            key={s}
            label={STATUS_LABELS[s]}
            count={counts[s] ?? 0}
            href={`/admin?status=${s}`}
            active={activeFilter === s}
            dotClass={STATUS_DOT_CLASSES[s]}
          />
        ))}
      </nav>

      {error ? (
        <p className="mt-6 text-red-700 dark:text-red-400">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : requests && requests.length > 0 ? (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="hidden gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[7rem_1.4fr_1fr_4rem_9rem] dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
            <span>Datum</span>
            <span>Klant</span>
            <span>Type</span>
            <span>Aantal</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/aanvragen/${request.id}`}
                  className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-violet-50/60 dark:hover:bg-violet-500/10 sm:grid-cols-[7rem_1.4fr_1fr_4rem_9rem] sm:items-center sm:gap-4"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatRequestDate(request.created_at)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 dark:text-white">
                      {request.customer_name}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {request.email}
                    </span>
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {TYPE_LABELS[request.type] ?? request.type}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">{request.quantity}</span>
                  <span>
                    <StatusBadge status={request.status as RequestStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="mt-6">
          <p className="text-slate-600 dark:text-slate-300">
            {activeFilter
              ? `Geen aanvragen met status “${STATUS_LABELS[activeFilter]}”.`
              : "Nog geen aanvragen."}
          </p>
        </Card>
      )}
    </>
  );
}

function FilterCard({
  label,
  count,
  href,
  active,
  dotClass,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  dotClass?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900 ${
        active
          ? "border-violet-600 ring-1 ring-violet-600 dark:border-violet-500 dark:ring-violet-500"
          : "border-slate-200 hover:border-violet-300 dark:border-slate-800 dark:hover:border-violet-500"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {dotClass && (
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        )}
        {label}
      </span>
      <span className="mt-1 block text-2xl font-bold text-slate-900 dark:text-white">
        {count}
      </span>
    </Link>
  );
}
