import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">3D Print Service</h1>
      <p className="text-lg text-gray-600">
        Binnenkort kun je hier 3D-prints bestellen.
      </p>
      <Link
        href="/aanvraag"
        className="rounded bg-gray-900 px-4 py-2 text-white"
      >
        Aanvraag indienen
      </Link>
    </main>
  );
}
