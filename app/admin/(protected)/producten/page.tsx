import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";

type ProductRow = {
  id: string;
  name: string;
  indicative_price: number | string | null;
  active: boolean;
  photos: string[];
  created_at: string;
};

export default async function AdminProductsPage() {
  const supabase = await createClient();
  // Admin RLS: all products, active or not.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, active, photos, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-red-700">{error.message}</p>;
  }
  const rows: ProductRow[] = products ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Producten</h1>
        <Link
          href="/admin/producten/nieuw"
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          Nieuw product
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-600">Nog geen producten.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 font-medium">Foto</th>
              <th className="py-2 pr-4 font-medium">Naam</th>
              <th className="py-2 pr-4 font-medium">Richtprijs</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Aangemaakt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  {product.photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={productPhotoUrl(product.photos[0])}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <span className="inline-block h-10 w-10 rounded bg-gray-100" />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/producten/${product.id}`}
                    className="font-medium text-blue-700 underline"
                  >
                    {product.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {product.indicative_price !== null
                    ? formatEuro(product.indicative_price)
                    : "—"}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      product.active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {product.active ? "actief" : "inactief"}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  {new Date(product.created_at).toLocaleDateString("nl-NL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
