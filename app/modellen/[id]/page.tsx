import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CubeLogo } from "@/components/site-header";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";

type Product = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  photos: string[];
};

// A malformed id makes Postgres error on the uuid cast; treat every failure
// mode (error, unknown id, inactive product) as the same Dutch 404 so
// inactive products' existence never leaks.
// Wrapped in cache() so generateMetadata and the page component share one
// fetch per request instead of querying twice.
const getProduct = cache(async (id: string): Promise<Product | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, photos")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? product.name : "Model niet gevonden" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [cover, ...rest] = product.photos;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <Link href="/modellen" className="text-sm text-violet-700 hover:underline">
          ← Alle modellen
        </Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productPhotoUrl(cover)}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <CubeLogo className="h-16 w-16 text-slate-300" />
                </div>
              )}
            </div>
            {rest.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {rest.map((path) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={path}
                    src={productPhotoUrl(path)}
                    alt={product.name}
                    className="aspect-square w-full rounded-xl border border-slate-200 object-cover"
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-bold text-slate-900">{product.name}</h1>
            {product.indicative_price !== null && (
              <p className="text-lg">
                Richtprijs vanaf{" "}
                <span className="font-semibold">
                  {formatEuro(product.indicative_price)}
                </span>
                <span className="block text-sm text-slate-500">
                  De definitieve prijs volgt in je offerte (kleur, materiaal en
                  aantal tellen mee).
                </span>
              </p>
            )}
            {product.description && (
              <p className="whitespace-pre-line text-slate-700">
                {product.description}
              </p>
            )}
            <ButtonLink
              href={`/aanvraag?product=${product.id}`}
              size="lg"
              className="mt-2 self-start"
            >
              Bestellen
            </ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
