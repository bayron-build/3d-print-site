import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  isRequestStatus,
  REQUEST_STATUSES,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
    .select("id, created_at, customer_name, type, quantity, status")
    .order("created_at", { ascending: false });
  if (activeFilter) {
    query = query.eq("status", activeFilter);
  }
  const { data: requests, error } = await query;

  return (
    <>
      <h1 className="text-2xl font-bold">Aanvragen</h1>
      <p className="mt-1 text-sm text-gray-600">
        {requests?.length ?? 0}{" "}
        {requests?.length === 1 ? "aanvraag" : "aanvragen"}
        {activeFilter ? ` met status “${STATUS_LABELS[activeFilter]}”` : ""}
      </p>

      <nav className="mt-4 flex flex-wrap gap-2">
        <FilterLink label="Alle" href="/admin" active={activeFilter === null} />
        {REQUEST_STATUSES.map((s) => (
          <FilterLink
            key={s}
            label={STATUS_LABELS[s]}
            href={`/admin?status=${s}`}
            active={activeFilter === s}
          />
        ))}
      </nav>

      {error ? (
        <p className="mt-6 text-red-700">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : requests && requests.length > 0 ? (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-2 pr-4 font-medium">Datum</th>
              <th className="py-2 pr-4 font-medium">Naam</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Aantal</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr
                key={request.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/aanvragen/${request.id}`}
                    className="block text-blue-700 underline"
                  >
                    {formatDate(request.created_at)}
                  </Link>
                </td>
                <td className="py-2 pr-4">{request.customer_name}</td>
                <td className="py-2 pr-4">
                  {TYPE_LABELS[request.type] ?? request.type}
                </td>
                <td className="py-2 pr-4">{request.quantity}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={request.status as RequestStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-6 text-gray-600">Nog geen aanvragen.</p>
      )}
    </>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
