import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Modellen",
  description:
    "Kant-en-klare 3D-print modellen met vaste prijzen — bestel direct.",
};

export default async function ModelsPage() {
  const supabase = await createClient();
  // RLS limits anon to active products; the filter keeps intent visible.
  // Active products predating the fixed-price rule may still have no price.
  // Listing one would offer a "Bestellen" link the order form then drops (it
  // filters on price too), stranding the customer on an unexplained empty
  // form -- so hide it here, same posture as /aanvraag.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, photos")
    .eq("active", true)
    .not("indicative_price", "is", null)
    .order("created_at", { ascending: false });
  const productList: ProductSummary[] = products ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">Modellen</h1>
        <p className="mt-2 max-w-xl text-slate-600">
          Kant-en-klare ontwerpen, geprint op bestelling, voor een vaste
          prijs. Geen offerte nodig — bestel direct.
        </p>
        {error ? (
          <p className="mt-8 text-red-700">{error.message}</p>
        ) : productList.length === 0 ? (
          <p className="mt-8 max-w-xl text-slate-600">
            De catalogus wordt gevuld — binnenkort vind je hier kant-en-klare
            modellen. Een eigen bestand of idee kun je nu al insturen.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productList.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
