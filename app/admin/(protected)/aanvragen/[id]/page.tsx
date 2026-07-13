import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_BADGE_CLASSES, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { QuoteForm } from "./quote-form";
import { DeleteButton } from "./delete-button";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

// Download links stay valid for one hour — long enough for the admin to grab
// files during a session, short enough that a leaked URL soon expires.
const SIGNED_URL_TTL_SECONDS = 3600;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id, created_at, type, customer_name, email, phone, description, color, material, quantity, license_accepted, status, quote_design_fee, quote_print_fee, admin_notes, product_id, products(name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <p className="text-red-700">
        Kon de aanvraag niet laden: {error.message}
      </p>
    );
  }
  if (!request) {
    notFound();
  }

  const { data: files } = await supabase
    .from("request_files")
    .select("id, storage_path, original_name, size_bytes")
    .eq("request_id", id)
    .order("created_at");

  // Batch-create signed download URLs. If this fails, the page still renders;
  // the file list shows a fallback note instead of links.
  let signedUrls: Record<string, string> = {};
  if (files && files.length > 0) {
    const { data: signed } = await supabase.storage
      .from("request-files")
      .createSignedUrls(
        files.map((file) => file.storage_path),
        SIGNED_URL_TTL_SECONDS
      );
    if (signed) {
      signedUrls = Object.fromEntries(
        signed
          .filter((entry) => entry.signedUrl && entry.path)
          .map((entry) => [entry.path as string, entry.signedUrl as string])
      );
    }
  }

  // Supabase types the embedded relation as an array; a request has at most
  // one product.
  const productName = Array.isArray(request.products)
    ? request.products[0]?.name
    : (request.products as { name: string } | null)?.name;

  return (
    <div className="max-w-2xl">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← Terug naar overzicht
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{request.customer_name}</h1>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_BADGE_CLASSES[request.status as RequestStatus] ??
            "bg-gray-100 text-gray-800"
          }`}
        >
          {STATUS_LABELS[request.status as RequestStatus] ?? request.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-gray-600">Type</dt>
        <dd>{TYPE_LABELS[request.type] ?? request.type}</dd>

        <dt className="text-gray-600">Ontvangen</dt>
        <dd>{formatDate(request.created_at)}</dd>

        <dt className="text-gray-600">E-mail</dt>
        <dd>
          <a href={`mailto:${request.email}`} className="text-blue-700 underline">
            {request.email}
          </a>
        </dd>

        {request.phone && (
          <>
            <dt className="text-gray-600">Telefoon</dt>
            <dd>{request.phone}</dd>
          </>
        )}

        {productName && (
          <>
            <dt className="text-gray-600">Product</dt>
            <dd>{productName}</dd>
          </>
        )}

        <dt className="text-gray-600">Aantal</dt>
        <dd>{request.quantity}</dd>

        {request.color && (
          <>
            <dt className="text-gray-600">Kleur</dt>
            <dd>{request.color}</dd>
          </>
        )}

        {request.material && (
          <>
            <dt className="text-gray-600">Materiaal</dt>
            <dd>{request.material}</dd>
          </>
        )}

        {request.description && (
          <>
            <dt className="text-gray-600">Omschrijving</dt>
            <dd className="whitespace-pre-wrap">{request.description}</dd>
          </>
        )}
      </dl>

      {request.type === "file" && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-600">Bestanden</h2>
          {files && files.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {files.map((file) => {
                const url = signedUrls[file.storage_path];
                return (
                  <li key={file.id}>
                    {url ? (
                      <a href={url} className="text-blue-700 underline">
                        {file.original_name}
                      </a>
                    ) : (
                      <span>{file.original_name}</span>
                    )}{" "}
                    <span className="text-gray-500">
                      ({formatSize(file.size_bytes)})
                      {url ? "" : " — download tijdelijk niet beschikbaar"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Geen bestanden.</p>
          )}
        </section>
      )}

      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold">Offerte &amp; status</h2>
        <QuoteForm
          requestId={request.id}
          designFee={request.quote_design_fee}
          printFee={request.quote_print_fee}
          status={request.status as RequestStatus}
          notes={request.admin_notes}
        />
      </section>

      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-red-700">Verwijderen</h2>
        <p className="mt-1 text-sm text-gray-600">
          Verwijdert de aanvraag en bijbehorende bestanden definitief.
        </p>
        <DeleteButton requestId={request.id} />
      </section>
    </div>
  );
}
