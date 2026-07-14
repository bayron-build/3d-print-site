import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_EMAIL } from "@/lib/site";
import dragon from "@/public/images/dragon.jpg";
import heroPrinter from "@/public/images/hero-printer.jpg";

// Matches the real pipeline: manual quote by email, Akkoord on the status
// page, pickup with bank transfer/Tikkie.
const STEPS = [
  ["Contact", "Stuur je idee, bestand of aanvraag via het formulier."],
  ["Offerte", "Je ontvangt per e-mail een prijsvoorstel."],
  ["Printen", "Na jouw akkoord wordt je opdracht met zorg geprint."],
  ["Levering", "Ophalen of bezorgen; betalen per bankoverschrijving of Tikkie."],
] as const;

const TRUST_BADGES = [
  "Hoge kwaliteit",
  "Ruime materiaalkeuze",
  "Snelle reactie",
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, photos")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(6);
  const productList: ProductSummary[] = products ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Dark hero band — the owner's requested contrast: dark top, white rest. */}
      <section className="bg-gray-950 text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-bold sm:text-5xl">
              Iets nodig in <span className="text-indigo-400">3D print</span>?
            </h1>
            <p className="text-lg text-gray-300">
              Upload je eigen bestand, vraag een custom ontwerp aan of kies uit
              kant-en-klare modellen. Hoge kwaliteit, snel geregeld, lokaal
              gemaakt.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/aanvraag?type=file"
                className="rounded bg-indigo-600 px-5 py-3 font-medium hover:bg-indigo-500"
              >
                Upload je bestand
              </Link>
              <Link
                href="/aanvraag?type=custom"
                className="rounded border border-gray-600 px-5 py-3 font-medium hover:border-gray-400"
              >
                Custom ontwerp aanvragen
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-300">
              {TRUST_BADGES.map((badge) => (
                <li key={badge} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-indigo-400">✓</span>
                  {badge}
                </li>
              ))}
            </ul>
          </div>
          <Image
            src={heroPrinter}
            alt="3D-printer die een vaas print"
            priority
            className="hidden rounded-lg lg:block"
          />
        </div>
      </section>

      <main className="flex-1">
        <section id="hoe-het-werkt" className="mx-auto w-full max-w-6xl px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hoe het werkt
          </p>
          <h2 className="mt-1 text-3xl font-bold">
            Simpel proces, mooi resultaat.
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="flex flex-col gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-gray-600">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-16">
          <div className="flex flex-col items-center gap-6 rounded-xl bg-indigo-50 p-8 sm:flex-row sm:justify-between">
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-2xl font-bold">Heb je een eigen idee?</h2>
              <p className="text-gray-700">
                Of het nu een prototype, een vervangingsonderdeel of iets
                unieks is — samen maken we het echt.
              </p>
              <Link
                href="/aanvraag?type=custom"
                className="self-start rounded bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500"
              >
                Custom ontwerp aanvragen →
              </Link>
            </div>
            <Image
              src={dragon}
              alt="3D-geprinte paarse draak"
              className="w-40 rounded-lg sm:w-44"
            />
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                  Modellen
                </p>
                <h2 className="mt-1 text-3xl font-bold">Klaar om te printen.</h2>
              </div>
              <Link
                href="/modellen"
                className="shrink-0 text-sm font-medium text-indigo-600 hover:underline"
              >
                Bekijk alle modellen →
              </Link>
            </div>
            {error ? (
              <p className="mt-8 text-red-700">{error.message}</p>
            ) : productList.length === 0 ? (
              <p className="mt-8 max-w-xl text-gray-600">
                De catalogus wordt gevuld — binnenkort vind je hier
                kant-en-klare modellen. Een eigen bestand of idee kun je nu al
                insturen.
              </p>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {productList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="contact" className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold">Contact</h2>
          <p className="mt-4 max-w-xl text-gray-600">
            PrintCraft is de 3D-printservice van Bayron — lokaal, in Nederland.
            Vragen of een speciale wens? Mail naar{" "}
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="text-indigo-600 hover:underline"
            >
              {SITE_EMAIL}
            </a>{" "}
            of dien direct een aanvraag in. Betalen kan per bankoverschrijving
            of Tikkie.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
