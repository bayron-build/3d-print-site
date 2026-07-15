import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

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
    return <p className="text-red-700 dark:text-red-400">{error.message}</p>;
  }
  const rows: ProductRow[] = products ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Producten</h1>
        <ButtonLink href="/admin/producten/nieuw">Nieuw product</ButtonLink>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-300">Nog geen producten.</p>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                <th className="px-4 py-2.5">Foto</th>
                <th className="px-4 py-2.5">Naam</th>
                <th className="px-4 py-2.5">Prijs</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-slate-100 hover:bg-violet-50/60 dark:border-slate-800 dark:hover:bg-violet-500/10"
                >
                  <td className="px-4 py-3">
                    {product.photos.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={productPhotoUrl(product.photos[0])}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="inline-block h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/producten/${product.id}`}
                      className="font-medium text-violet-700 hover:underline dark:text-violet-400"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {product.indicative_price !== null
                      ? formatEuro(product.indicative_price)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        product.active
                          ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {product.active ? "actief" : "inactief"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(product.created_at).toLocaleDateString("nl-NL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
