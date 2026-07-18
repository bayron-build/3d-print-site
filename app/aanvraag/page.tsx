import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import {
  IconChat,
  IconClipboard,
  IconPrinter,
  IconTruck,
} from "@/components/ui/icons";
import { SITE_EMAIL } from "@/lib/site";
import { resolveColorId, type FilamentColor } from "@/lib/colors";
import { RequestForm, type FormType, type ProductOption } from "./request-form";

export const metadata = { title: "Aanvraag indienen" };

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { product, type, color } = await searchParams;
  const supabase = await createClient();

  // RLS already limits anon to active products; the explicit filter keeps
  // the intent visible in code too. Active products predating the fixed-price
  // rule may still have no price — they must not be orderable until priced.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price")
    .eq("active", true)
    .not("indicative_price", "is", null)
    .order("name");

  const { data: colorRows } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");
  const colors: FilamentColor[] = colorRows ?? [];
  // Unknown ?color= id: silently fall back to default black, same posture
  // as ?product= and ?type=.
  const initialColorId = resolveColorId(color, colors);

  const productList: ProductOption[] = products ?? [];
  // Unknown or inactive ?product= id: silently ignore, no pre-selection.
  const preselected =
    typeof product === "string" &&
    productList.some((option) => option.id === product)
      ? product
      : "";
  // Unknown ?type= value: silently ignore, same posture as ?product=.
  const initialType: FormType | "" =
    type === "catalog" || type === "file" || type === "custom" ? type : "";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-slate-900">
            Aanvraag indienen
          </h1>
          <p className="mt-2 text-slate-600">
            Vertel ons wat je wilt laten printen. Kant-en-klare producten
            hebben een vaste prijs; voor eigen bestanden en ontwerpen ontvang
            je eerst een prijsvoorstel.
          </p>
        </div>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            {error ? (
              <p className="text-red-700">
                Kon het formulier niet laden, probeer het later opnieuw.
              </p>
            ) : (
              <RequestForm
                products={productList}
                preselectedProductId={preselected}
                initialType={initialType}
                colors={colors}
                initialColorId={initialColorId}
              />
            )}
          </Card>
          <RequestSidebar />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// Trust sidebar: shows the process and takes the "is this legit?" edge off
// the form (spec: the form alone felt scam-like).
function RequestSidebar() {
  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <h2 className="font-semibold text-slate-900">Zo werkt het</h2>
        <ol className="mt-3 flex flex-col gap-3 text-sm text-slate-600">
          {(
            [
              ["Contact", IconChat],
              ["Vaste prijs of offerte", IconClipboard],
              ["Printen", IconPrinter],
              ["Ophalen of bezorgen", IconTruck],
            ] as const
          ).map(([label, Icon], index) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="font-medium text-slate-900">
                  {index + 1}.
                </span>{" "}
                {label}
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="bg-violet-50">
        <h2 className="font-semibold text-slate-900">Goed om te weten</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
          <li>
            Kant-en-klare producten hebben een vaste prijs — geen offerte
            nodig.
          </li>
          <li>
            Voor eigen bestanden en ontwerpen betaal je pas nadat je akkoord
            bent gegaan met de offerte.
          </li>
          <li>Je krijgt meestal binnen 1–2 dagen antwoord.</li>
          <li>Betalen kan per bankoverschrijving of Tikkie.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Vragen? Mail{" "}
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="font-medium text-violet-700 hover:underline"
          >
            {SITE_EMAIL}
          </a>
        </p>
      </Card>
    </aside>
  );
}
