import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { priceToInput } from "@/lib/products/validation";
import { updateProduct } from "../actions";
import { ProductForm } from "../product-form";
import { PhotoManager } from "./photo-manager";
import { VersionsManager } from "./versions-manager";
import { DeleteProductButton } from "./delete-button";
import { Card } from "@/components/ui/card";
import type { ProductVersion } from "@/lib/products/versions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, base_version_label, active, photos")
    .eq("id", id)
    .maybeSingle();
  if (error || !product) notFound();

  // Version list for the Uitvoeringen block. On a fetch error the block
  // renders empty; saving will surface errors of its own.
  const { data: versionRows } = await supabase
    .from("product_versions")
    .select("id, product_id, name, price, compare_at_price, photo_path, sort_order")
    .eq("product_id", id)
    .order("sort_order");
  const versions: ProductVersion[] = versionRows ?? [];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Product bewerken</h1>
      <Card className="max-w-xl">
        <ProductForm
          action={updateProduct}
          productId={product.id}
          initial={{
            name: product.name,
            description: product.description ?? "",
            indicativePrice: priceToInput(product.indicative_price),
            baseVersionLabel: product.base_version_label ?? "",
            active: product.active,
          }}
          submitLabel="Opslaan"
        />
      </Card>
      <Card className="max-w-xl">
        <PhotoManager productId={product.id} photos={product.photos} />
      </Card>
      <Card className="max-w-xl">
        <VersionsManager
          productId={product.id}
          photos={product.photos}
          versions={versions}
        />
      </Card>
      <DeleteProductButton productId={product.id} />
    </div>
  );
}
