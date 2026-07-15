import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_EMAIL } from "@/lib/site";
import { AkkoordButton } from "./akkoord-button";

// Private-by-token page: never let a shared or leaked link end up in a
// search index.
export const metadata: Metadata = {
  title: "Status van je aanvraag",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The linear pipeline shown in the progress indicator; rejected renders as a
// distinct banner instead of a step.
const PIPELINE = [
  "received",
  "quoted",
  "approved",
  "printing",
  "done",
] as const satisfies readonly RequestStatus[];

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

// Shape returned by the get_request_by_token function (migration 0004).
type TokenRequest = {
  type: string;
  status: string;
  product_name: string | null;
  quantity: number;
  description: string | null;
  color: string | null;
  material: string | null;
  quote_design_fee: number | string | null;
  quote_print_fee: number | string | null;
  created_at: string;
  file_names: string[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { token } = await params;

  // A non-uuid string would make Postgres error on the cast; treat it the
  // same as an unknown token.
  if (!UUID_PATTERN.test(token)) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_by_token", {
    p_token: token,
  });

  const request = (data as TokenRequest[] | null)?.[0];
  if (error || !request) {
    notFound();
  }

  const status = request.status as RequestStatus;
  const hasQuote =
    request.quote_design_fee !== null || request.quote_print_fee !== null;
  const total =
    toAmount(request.quote_design_fee) + toAmount(request.quote_print_fee);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Je aanvraag</h1>
      <p className="mt-1 text-sm text-slate-600">
        Ingediend op {formatDate(request.created_at)}
      </p>

      <section className="mt-6">
        {status === "rejected" ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            Deze aanvraag is helaas afgewezen. Vragen? Neem contact met ons op
            via{" "}
            <a href={`mailto:${SITE_EMAIL}`} className="font-medium underline">
              {SITE_EMAIL}
            </a>
            .
          </p>
        ) : (
          <ol className="flex flex-wrap gap-2">
            {PIPELINE.map((step, index) => {
              const reached = index <= PIPELINE.indexOf(status as (typeof PIPELINE)[number]);
              return (
                <li
                  key={step}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    reached
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-300 text-slate-500"
                  }`}
                >
                  {STATUS_LABELS[step]}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate-600">Type</dt>
        <dd>{TYPE_LABELS[request.type] ?? request.type}</dd>

        {request.product_name && (
          <>
            <dt className="text-slate-600">Product</dt>
            <dd>{request.product_name}</dd>
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

        {request.file_names.length > 0 && (
          <>
            <dt className="text-slate-600">Bestanden</dt>
            <dd>
              <ul>
                {request.file_names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {hasQuote && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Offerte</h2>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            {request.quote_design_fee !== null && (
              <>
                <dt className="text-slate-600">Ontwerpkosten</dt>
                <dd>{formatEuro(request.quote_design_fee)}</dd>
              </>
            )}
            {request.quote_print_fee !== null && (
              <>
                <dt className="text-slate-600">Printkosten</dt>
                <dd>{formatEuro(request.quote_print_fee)}</dd>
              </>
            )}
            <dt className="font-medium">Totaal</dt>
            <dd className="font-medium">{formatEuro(total)}</dd>
          </dl>

          {status === "quoted" && (
            <>
              <p className="mt-4 text-sm text-slate-600">
                Ga je akkoord met deze offerte? Dan gaan we voor je aan de
                slag.
              </p>
              <AkkoordButton token={token} />
            </>
          )}
          {status === "approved" && (
            <p className="mt-4 text-sm text-green-700">
              Je bent akkoord gegaan met de offerte.
            </p>
          )}
        </section>
      )}
      </main>
      <SiteFooter />
    </div>
  );
}
