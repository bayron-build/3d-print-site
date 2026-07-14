import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type RequestStatus } from "@/lib/requests/status";
import { statusPageUrl } from "@/lib/email/notifications";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFileSize } from "@/lib/format";
import { QuoteForm } from "./quote-form";
import { DeleteButton } from "./delete-button";
import { CopyStatusLink } from "./copy-status-link";

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
      "id, created_at, type, customer_name, email, phone, description, color, material, quantity, status, quote_design_fee, quote_print_fee, admin_notes, access_token, products(name)"
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

  const { data: files, error: filesError } = await supabase
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
    <div className="max-w-3xl">
      <Link href="/admin" className="text-sm text-violet-700 hover:underline">
        ← Terug naar overzicht
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{request.customer_name}</h1>
        <StatusBadge status={request.status as RequestStatus} />
      </div>

      <Card className="mt-6">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-600">Type</dt>
          <dd>{TYPE_LABELS[request.type] ?? request.type}</dd>

          <dt className="text-slate-600">Ontvangen</dt>
          <dd>{formatDate(request.created_at)}</dd>

          <dt className="text-slate-600">E-mail</dt>
          <dd>
            <a href={`mailto:${request.email}`} className="text-violet-700 hover:underline">
              {request.email}
            </a>
          </dd>

          {request.phone && (
            <>
              <dt className="text-slate-600">Telefoon</dt>
              <dd>{request.phone}</dd>
            </>
          )}

          {productName && (
            <>
              <dt className="text-slate-600">Product</dt>
              <dd>{productName}</dd>
            </>
          )}

          <dt className="text-slate-600">Aantal</dt>
          <dd>{request.quantity}</dd>

          {request.color && (
            <>
              <dt className="text-slate-600">Kleur</dt>
              <dd>{request.color}</dd>
            </>
          )}

          {request.material && (
            <>
              <dt className="text-slate-600">Materiaal</dt>
              <dd>{request.material}</dd>
            </>
          )}

          {request.description && (
            <>
              <dt className="text-slate-600">Omschrijving</dt>
              <dd className="whitespace-pre-wrap">{request.description}</dd>
            </>
          )}
        </dl>

        {request.type === "file" && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-slate-600">Bestanden</h2>
            {filesError ? (
              <p className="mt-2 text-sm text-red-700">
                Kon bestanden niet laden.
              </p>
            ) : files && files.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {files.map((file) => {
                  const url = signedUrls[file.storage_path];
                  return (
                    <li key={file.id}>
                      {url ? (
                        <a href={url} className="text-violet-700 hover:underline">
                          {file.original_name}
                        </a>
                      ) : (
                        <span>{file.original_name}</span>
                      )}{" "}
                      <span className="text-slate-500">
                        ({formatFileSize(file.size_bytes)})
                        {url ? "" : " — download tijdelijk niet beschikbaar"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Geen bestanden.</p>
            )}
          </section>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-bold text-slate-900">Statuspagina van de klant</h2>
        <p className="mt-1 text-sm text-slate-600">
          Op deze pagina ziet de klant de status en de offerte, en kan die
          akkoord geven. Handig om zelf te delen (bijv. via WhatsApp) als de
          e-mail de klant niet bereikt.
        </p>
        <CopyStatusLink url={statusPageUrl(request.access_token)} />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-bold text-slate-900">Offerte &amp; status</h2>
        <QuoteForm
          requestId={request.id}
          designFee={request.quote_design_fee}
          printFee={request.quote_print_fee}
          status={request.status as RequestStatus}
          notes={request.admin_notes}
        />
      </Card>

      <Card className="mt-6 border-red-200">
        <h2 className="text-lg font-bold text-red-700">Verwijderen</h2>
        <p className="mt-1 text-sm text-slate-600">
          Verwijdert de aanvraag en bijbehorende bestanden definitief.
        </p>
        <DeleteButton requestId={request.id} />
      </Card>
    </div>
  );
}
