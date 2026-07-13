import Link from "next/link";

// Rendered (with HTTP 404) whenever the page calls notFound(): malformed
// token, unknown token — deliberately indistinguishable, so probing URLs
// leaks nothing.
export default function StatusNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Deze link is niet (meer) geldig</h1>
      <p className="max-w-md text-gray-600">
        Controleer of je de volledige link uit de e-mail hebt gebruikt. Kom je
        er niet uit? Beantwoord dan de e-mail die je van ons kreeg.
      </p>
      <Link href="/" className="underline">
        Terug naar de homepagina
      </Link>
    </main>
  );
}
