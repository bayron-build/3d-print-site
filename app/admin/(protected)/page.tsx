import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  // head: true fetches only the count, no row data.
  const { count, error } = await supabase
    .from("requests")
    .select("*", { count: "exact", head: true });

  return (
    <>
      <h1 className="text-2xl font-bold">Aanvragen</h1>
      {error ? (
        <p className="mt-4 text-red-700">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : (
        <p className="mt-4">
          {count ?? 0} {count === 1 ? "aanvraag" : "aanvragen"}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-600">
        Het volledige overzicht komt in fase 4.
      </p>
    </>
  );
}
