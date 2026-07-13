import { createClient } from "@/lib/supabase/server";
import { RequestForm, type ProductOption } from "./request-form";

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { product } = await searchParams;
  const supabase = await createClient();

  // RLS already limits anon to active products; the explicit filter keeps
  // the intent visible in code too.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price")
    .eq("active", true)
    .order("name");

  const productList: ProductOption[] = products ?? [];
  // Unknown or inactive ?product= id: silently ignore, no pre-selection.
  const preselected =
    typeof product === "string" &&
    productList.some((option) => option.id === product)
      ? product
      : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-3xl font-bold">Aanvraag indienen</h1>
      <p className="text-gray-600">
        Vertel ons wat je wilt laten printen. Je ontvangt per e-mail een
        prijsvoorstel — je betaalt pas na akkoord.
      </p>
      {error ? (
        <p className="text-red-700">
          Kon het formulier niet laden, probeer het later opnieuw.
        </p>
      ) : (
        <RequestForm
          products={productList}
          preselectedProductId={preselected}
        />
      )}
    </main>
  );
}
