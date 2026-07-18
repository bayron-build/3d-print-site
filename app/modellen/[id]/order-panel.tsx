"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ColorPicker } from "@/components/color-picker";
import { DEFAULT_COLOR_ID, type FilamentColor } from "@/lib/colors";

// Color choice + Bestellen button. Client component because the chosen
// color must ride along in the order link. With an empty color list (fetch
// failure) the picker hides and the link degrades to the pre-color URL.
export function OrderPanel({
  productId,
  colors,
}: {
  productId: string;
  colors: FilamentColor[];
}) {
  const [colorId, setColorId] = useState(DEFAULT_COLOR_ID);
  const href =
    colors.length > 0
      ? `/aanvraag?product=${productId}&color=${colorId}`
      : `/aanvraag?product=${productId}`;
  return (
    <>
      <ColorPicker colors={colors} selectedId={colorId} onSelect={setColorId} />
      <ButtonLink href={href} size="lg" className="mt-2 self-start">
        Bestellen
      </ButtonLink>
    </>
  );
}
