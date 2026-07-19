"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ColorPicker } from "@/components/color-picker";
import { CubeLogo } from "@/components/site-header";
import { DEFAULT_COLOR_ID, type FilamentColor } from "@/lib/colors";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";
import type { VersionOption } from "@/lib/products/versions";
import { VersionPicker } from "./version-picker";

export type ProductViewData = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  photos: string[];
};

// Gallery + info + version/color pickers + Bestellen. Client component
// because the chosen version swaps the cover image and price line, and the
// chosen color and version must ride along in the order link. With empty
// options/colors (versionless product or degraded fetch) the pickers hide
// and everything renders exactly as before this feature.
export function ProductView({
  product,
  colors,
  options,
}: {
  product: ProductViewData;
  colors: FilamentColor[];
  options: VersionOption[];
}) {
  const [colorId, setColorId] = useState(DEFAULT_COLOR_ID);
  // "" selects the base-price option; only real version ids ride the link.
  const [versionId, setVersionId] = useState("");
  const selected = options.find((option) => option.id === versionId);

  const price = selected ? selected.price : product.indicative_price;
  const cover = selected?.photoPath ?? product.photos[0];
  const rest = product.photos.slice(1);

  let href = `/aanvraag?product=${product.id}`;
  if (colors.length > 0) href += `&color=${colorId}`;
  if (versionId !== "") href += `&version=${versionId}`;

  return (
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
        {price !== null && (
          <p className="text-lg">
            Vaste prijs{" "}
            <span className="font-semibold">{formatEuro(price)}</span>
            <span className="block text-sm text-slate-500">
              Geen offerte nodig — na je bestelling gaan we direct voor je
              aan de slag.
            </span>
          </p>
        )}
        {product.description && (
          <p className="whitespace-pre-line text-slate-700">
            {product.description}
          </p>
        )}
        <VersionPicker
          options={options}
          selectedId={versionId}
          onSelect={setVersionId}
        />
        <ColorPicker colors={colors} selectedId={colorId} onSelect={setColorId} />
        <ButtonLink href={href} size="lg" className="mt-2 self-start">
          Bestellen
        </ButtonLink>
      </div>
    </div>
  );
}
