import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildVersionOptions } from "@/lib/products/versions";
import type { FilamentColor } from "@/lib/colors";
import { ProductView } from "./product-view";

type Product = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  base_version_label: string | null;
  photos: string[];
};

// A malformed id makes Postgres error on the uuid cast; treat every failure
// mode (error, unknown id, inactive product, active-but-unpriced product) as
// the same Dutch 404 so inactive products' existence never leaks. An unpriced
// product joins that list because it isn't orderable: the order form filters
// it out, so its "Bestellen" button would strand the customer on an empty
// form. Collapsing it into the same 404 keeps that one exit here too.
// Wrapped in cache() so generateMetadata and the page component share one
// fetch per request instead of querying twice.
const getProduct = cache(async (id: string): Promise<Product | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, base_version_label, photos")
    .eq("id", id)
    .eq("active", true)
    .not("indicative_price", "is", null)
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

  // Color palette for the picker. A fetch error degrades to no picker rather
  // than a broken page; the order form falls back to default black.
  const supabase = await createClient();
  const { data: colorRows } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");
  const colors: FilamentColor[] = colorRows ?? [];

  // Versions for the picker — same degrade philosophy: a fetch error means
  // no picker, base price only.
  const { data: versionRows } = await supabase
    .from("product_versions")
    .select("id, product_id, name, price, compare_at_price, photo_path, sort_order")
    .eq("product_id", product.id)
    .order("sort_order");
  const options = buildVersionOptions(product, versionRows ?? []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10">
        <Link href="/modellen" className="text-sm text-violet-700 hover:underline">
          ← Alle modellen
        </Link>
        <ProductView product={product} colors={colors} options={options} />
      </main>
      <SiteFooter />
    </div>
  );
}
