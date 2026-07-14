import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Model niet gevonden</h1>
        <p className="max-w-md text-slate-600">
          Dit model bestaat niet (meer). Bekijk de andere modellen of dien een
          eigen aanvraag in.
        </p>
        <Link href="/modellen" className="text-violet-700 underline">
          Naar alle modellen
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
