"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateVersion } from "@/lib/products/versions";

export type VersionFormState = {
  errors: Record<string, string> | null;
  ok: boolean;
};

export type VersionActionResult = { ok: boolean; message?: string };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// Version changes affect the product detail page (picker), the catalog and
// homepage (uitvoeringen hint) and this admin page. Mirrors
// revalidateProductPaths in ../actions.ts, which "use server" cannot export.
function revalidateVersionPaths(productId: string) {
  revalidatePath("/");
  revalidatePath("/modellen");
  revalidatePath(`/modellen/${productId}`);
  revalidatePath(`/admin/producten/${productId}`);
}

// One action for create and update: the form posts a versionId only when
// editing, so the client needs no action-swapping.
export async function saveVersion(
  _prevState: VersionFormState,
  formData: FormData
): Promise<VersionFormState> {
  const productId = String(formData.get("productId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!productId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateVersion({
    name: String(formData.get("name") ?? ""),
    price: String(formData.get("price") ?? ""),
    compareAtPrice: String(formData.get("compareAtPrice") ?? ""),
  });
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const photoPath = String(formData.get("photoPath") ?? "");
  const supabase = await createClient();

  // The picker offers only the product's own photos; re-check server-side so
  // a hand-crafted submit cannot point a version at a foreign or stale path.
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (productError || !product) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }
  if (photoPath !== "" && !product.photos.includes(photoPath)) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const values = {
    name: result.data.name,
    price: result.data.price,
    compare_at_price: result.data.compareAtPrice,
    photo_path: photoPath || null,
  };

  if (versionId === "") {
    // Append at the end; steps of 10 leave room, like the color seed.
    const { data: last, error: lastError } = await supabase
      .from("product_versions")
      .select("sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
    const { error } = await supabase.from("product_versions").insert({
      product_id: productId,
      ...values,
      sort_order: (last?.sort_order ?? 0) + 10,
    });
    if (error) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
  } else {
    // The product_id filter stops a forged (productId, versionId) pair from
    // editing another product's version; RLS alone would allow the admin to.
    const { data, error } = await supabase
      .from("product_versions")
      .update(values)
      .eq("id", versionId)
      .eq("product_id", productId)
      .select("id");
    if (error || !data || data.length === 0) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
  }

  revalidateVersionPaths(productId);
  return { errors: null, ok: true };
}

// Orders keep their snapshots (version_name + unit_price on the request);
// deleting a version only removes it from the site.
export async function deleteVersion(
  productId: string,
  versionId: string
): Promise<VersionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_versions")
    .delete()
    .eq("id", versionId)
    .eq("product_id", productId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateVersionPaths(productId);
  return { ok: true };
}

export async function moveVersion(
  productId: string,
  versionId: string,
  direction: "up" | "down"
): Promise<VersionActionResult> {
  const supabase = await createClient();
  const { data: versions, error } = await supabase
    .from("product_versions")
    .select("id, sort_order")
    .eq("product_id", productId)
    .order("sort_order");
  if (error || !versions) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const index = versions.findIndex((version) => version.id === versionId);
  if (index === -1) {
    return { ok: false, message: GENERIC_ERROR };
  }
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= versions.length) {
    return { ok: true }; // already at the edge — nothing to do
  }

  const current = versions[index];
  const neighbor = versions[neighborIndex];
  // Two updates swap the sort keys. Not atomic, but single-admin: a failed
  // second update at worst leaves two rows sharing an order value, which
  // only affects display order and is fixed by the next successful move.
  const first = await supabase
    .from("product_versions")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id)
    .select("id");
  if (first.error || !first.data || first.data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }
  const second = await supabase
    .from("product_versions")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id)
    .select("id");
  if (second.error || !second.data || second.data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateVersionPaths(productId);
  return { ok: true };
}
