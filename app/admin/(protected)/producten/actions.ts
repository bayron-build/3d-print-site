"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTOS, validateProduct } from "@/lib/products/validation";

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

export async function updateProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateProduct(readProductInput(formData));
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: result.data.name,
      description: result.data.description,
      indicative_price: result.data.indicativePrice,
      active: result.data.active,
    })
    .eq("id", productId)
    .select("id");

  // No matching row (e.g. deleted in another tab) reports failure, not success.
  if (error || !data || data.length === 0) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidateProductPaths(productId);
  return { errors: null, ok: true };
}

export type DeleteProductState = { error: string | null };

const PRODUCT_IN_USE =
  "Dit product is gebruikt in aanvragen en kan niet worden verwijderd. Zet het op inactief.";

// Spec order: check for referencing requests BEFORE touching storage, so a
// product that must stay keeps its photos. The storage sweep lists the
// product's folder, which also removes any orphaned uploads in it.
export async function deleteProduct(
  _prevState: DeleteProductState,
  formData: FormData
): Promise<DeleteProductState> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (countError) {
    return { error: GENERIC_ERROR };
  }
  if ((count ?? 0) > 0) {
    return { error: PRODUCT_IN_USE };
  }

  const { data: objects, error: listError } = await supabase.storage
    .from("product-photos")
    .list(productId);
  if (listError) {
    return { error: "Kon de foto's niet ophalen." };
  }
  if (objects && objects.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("product-photos")
      .remove(objects.map((object) => `${productId}/${object.name}`));
    if (removeError) {
      return { error: "Kon de foto's niet verwijderen." };
    }
  }

  const { error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (deleteError) {
    // FK from a request created between the check and the delete —
    // effectively theoretical for a single admin.
    return { error: PRODUCT_IN_USE };
  }

  revalidateProductPaths(productId);
  redirect("/admin/producten");
}

export type PhotoActionResult = { ok: boolean; message?: string };

// The bytes went browser → storage already (10MB photos cannot ride through
// a server action); this only records the path on the product row.
export async function addProductPhoto(
  productId: string,
  path: string
): Promise<PhotoActionResult> {
  // The path must live under this product's folder — reject anything else.
  if (!path.startsWith(`${productId}/`)) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) {
    return { ok: false, message: GENERIC_ERROR };
  }

  // Mirror validatePhotos' over-max guard server-side, not just in the client.
  if (product.photos.length >= MAX_PHOTOS) {
    return { ok: false, message: `Maximaal ${MAX_PHOTOS} foto's per product.` };
  }

  const { data, error } = await supabase
    .from("products")
    .update({ photos: [...product.photos, path] })
    .eq("id", productId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateProductPaths(productId);
  return { ok: true };
}

// Storage object first, then the array entry: a failed storage delete
// leaves the photo visible (retryable) instead of orphaned-but-invisible.
export async function deleteProductPhoto(
  productId: string,
  path: string
): Promise<PhotoActionResult> {
  // The path must live under this product's folder — reject anything else so a
  // mismatched (productId, path) pair cannot delete another product's object.
  if (!path.startsWith(`${productId}/`)) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("product-photos")
    .remove([path]);
  if (storageError) {
    return { ok: false, message: "Kon de foto niet verwijderen." };
  }

  const { data: product, error: readError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const { data, error } = await supabase
    .from("products")
    .update({ photos: product.photos.filter((p: string) => p !== path) })
    .eq("id", productId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateProductPaths(productId);
  return { ok: true };
}
