import Link from "next/link";
import { SITE_EMAIL } from "@/lib/site";

// Rendered (with HTTP 404) whenever the page calls notFound(): malformed
// token, unknown token — deliberately indistinguishable, so probing URLs
// leaks nothing.
export default function StatusNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Deze link is niet (meer) geldig</h1>
      <p className="max-w-md text-slate-600">
        Controleer of je de volledige link hebt gebruikt. Kom je er niet uit?
        Neem contact met ons op via{" "}
        <a
          href={`mailto:${SITE_EMAIL}`}
          className="font-medium text-violet-700 underline"
        >
          {SITE_EMAIL}
        </a>
        .
      </p>
      <Link href="/" className="underline">
        Terug naar de homepagina
      </Link>
    </main>
  );
}
