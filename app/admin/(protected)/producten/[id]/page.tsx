import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { priceToInput } from "@/lib/products/validation";
import { updateProduct } from "../actions";
import { ProductForm } from "../product-form";
import { PhotoManager } from "./photo-manager";
import { DeleteProductButton } from "./delete-button";

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
    .select("id, name, description, indicative_price, active, photos")
    .eq("id", id)
    .maybeSingle();
  if (error || !product) notFound();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Product bewerken</h1>
      <ProductForm
        action={updateProduct}
        productId={product.id}
        initial={{
          name: product.name,
          description: product.description ?? "",
          indicativePrice: priceToInput(product.indicative_price),
          active: product.active,
        }}
        submitLabel="Opslaan"
      />
      <PhotoManager productId={product.id} photos={product.photos} />
      <DeleteProductButton productId={product.id} />
    </div>
  );
}
