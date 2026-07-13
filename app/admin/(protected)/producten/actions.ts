"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateProduct } from "@/lib/products/validation";

export type ProductFormState = {
  errors: Record<string, string> | null;
  ok: boolean;
};

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

function readProductInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    indicativePrice: String(formData.get("indicativePrice") ?? ""),
    active: formData.get("active") === "on",
  };
}

// Public pages cache per-product and list views; every mutation refreshes
// them all so the catalog never shows stale products.
function revalidateProductPaths(productId?: string) {
  revalidatePath("/");
  revalidatePath("/modellen");
  revalidatePath("/admin/producten");
  if (productId) {
    revalidatePath(`/modellen/${productId}`);
    revalidatePath(`/admin/producten/${productId}`);
  }
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const result = validateProduct(readProductInput(formData));
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  // RLS restricts INSERT on products to the admin.
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: result.data.name,
      description: result.data.description,
      indicative_price: result.data.indicativePrice,
      active: result.data.active,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidateProductPaths(data.id);
  // Photos are uploaded on the edit page, against the row that now exists.
  redirect(`/admin/producten/${data.id}`);
}
