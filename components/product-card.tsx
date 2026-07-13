import Link from "next/link";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";
import { CubeLogo } from "./site-header";

export type ProductSummary = {
  id: string;
  name: string;
  indicative_price: number | string | null;
  photos: string[];
};

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/modellen/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full bg-gray-100">
        {product.photos.length > 0 ? (
          // Plain <img>: Supabase already serves these from its CDN;
          // next/image remote config would add setup for little gain here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productPhotoUrl(product.photos[0])}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CubeLogo className="h-12 w-12 text-gray-300" />
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2 p-3">
        <span className="text-sm font-medium">{product.name}</span>
        {product.indicative_price !== null && (
          <span className="shrink-0 text-sm text-gray-500">
            Vanaf {formatEuro(product.indicative_price)}
          </span>
        )}
      </div>
    </Link>
  );
}
