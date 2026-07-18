"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult = { ok: boolean };

// Flip a color's op-voorraad flag. RLS restricts UPDATE to the admin, so a
// non-admin call updates zero rows and reports failure.
export async function toggleColorAvailability(
  colorId: string,
  available: boolean
): Promise<ToggleResult> {
  if (!colorId) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filament_colors")
    .update({ available })
    .eq("id", colorId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  // The picker renders on every product page and in the order form.
  revalidatePath("/aanvraag");
  revalidatePath("/modellen");
  revalidatePath("/modellen/[id]", "page");
  revalidatePath("/admin/kleuren");
  return { ok: true };
}
