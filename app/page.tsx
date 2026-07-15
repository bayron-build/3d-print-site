import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  IconChat,
  IconClipboard,
  IconLayers,
  IconPrinter,
  IconShieldCheck,
  IconTruck,
} from "@/components/ui/icons";
import dragon from "@/public/images/dragon.jpg";
import heroPrinter from "@/public/images/hero-printer-dark.jpg";

// Matches the real pipeline: manual quote, Akkoord on the status page,
// pickup with bank transfer/Tikkie. The quote link is currently shared
// personally (e.g. WhatsApp) until a verified email domain exists, so the
// public copy stays channel-neutral.
const STEPS = [
  ["Contact", "Stuur je idee, bestand of aanvraag via het formulier.", IconChat],
  ["Offerte", "Je ontvangt een prijsvoorstel met een persoonlijke link.", IconClipboard],
  ["Printen", "Na jouw akkoord wordt je opdracht met zorg geprint.", IconPrinter],
  ["Levering", "Ophalen of bezorgen; betalen per bankoverschrijving of Tikkie.", IconTruck],
] as const;

const TRUST_BADGES = [
  ["Hoge kwaliteit", "Strak en precies geprint", IconShieldCheck],
  ["Ruime materiaalkeuze", "Van PLA tot PETG", IconLayers],
  ["Snelle reactie", "Meestal binnen een dag", IconChat],
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

      <main className="flex-1">
        {/* Full-bleed hero (mockup layout): the photo IS the section
            background — its dark left side carries the text, a gradient
            overlay keeps it readable, and the dark header above melts into
            it. No framed image, no visible photo edge. */}
        <section className="relative overflow-hidden bg-slate-950">
          {/* Right-anchored on desktop so the wide band doesn't over-crop
              (zoom into) the photo; its own black left side blends into the
              section background. Full-bleed backdrop on mobile. */}
          <div className="absolute inset-0 lg:left-auto lg:w-[62%]">
            <Image
              src={heroPrinter}
              alt="3D-printer print een paars raster in het donker"
              priority
              fill
              sizes="(min-width: 1024px) 62vw, 100vw"
              className="object-cover object-[65%_62%]"
            />
          </div>
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-slate-950 from-10% via-slate-950/70 to-slate-950/15"
          />
          <div className="relative mx-auto w-full max-w-[88rem] px-6 py-14 lg:py-24">
            <div className="flex max-w-2xl flex-col gap-5">
              <h1 className="text-4xl font-bold text-white sm:text-5xl">
                Iets nodig in{" "}
                <span className="text-violet-400">3D print</span>?
              </h1>
              <p className="max-w-xl text-lg text-slate-300">
                Upload je eigen bestand, vraag een custom ontwerp aan of kies
                uit kant-en-klare modellen. Hoge kwaliteit, snel geregeld,
                lokaal gemaakt.
              </p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/aanvraag?type=file" size="lg">
                  Upload je bestand
                </ButtonLink>
                <ButtonLink
                  href="/aanvraag?type=custom"
                  variant="inverse-outline"
                  size="lg"
                >
                  Custom ontwerp aanvragen
                </ButtonLink>
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-8 gap-y-3">
                {TRUST_BADGES.map(([title, sub, Icon]) => (
                  <li key={title} className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-white">
                        {title}
                      </span>
                      <span className="text-xs text-slate-400">{sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works + custom-idea card in one band (mockup layout). */}
        <section id="hoe-het-werkt" className="mx-auto w-full max-w-[88rem] px-6 py-10">
          <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <SectionHeading
                eyebrow="Hoe het werkt"
                title="Simpel proces, mooi resultaat."
              />
              <ol className="mt-6 grid gap-6 sm:grid-cols-2">
                {STEPS.map(([title, text, Icon], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <h3 className="font-semibold text-slate-900">
                        {index + 1}. {title}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-600">{text}</p>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex items-center gap-5 rounded-xl bg-violet-50 p-6">
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-bold text-slate-900">
                  Heb je een eigen idee?
                </h2>
                <p className="text-sm text-slate-600">
                  Of het nu een prototype, een vervangingsonderdeel of iets
                  unieks is — samen maken we het echt.
                </p>
                <ButtonLink href="/aanvraag?type=custom" className="self-start">
                  Custom ontwerp aanvragen →
                </ButtonLink>
              </div>
              <Image
                src={dragon}
                alt="3D-geprinte paarse draak"
                className="hidden w-28 rounded-lg sm:block"
              />
            </div>
          </div>
        </section>

        {/* Models band starts at the bottom edge of the first screen. */}
        <section className="border-t border-violet-100 bg-violet-50">
          <div className="mx-auto w-full max-w-[88rem] px-6 py-10">
            <div className="flex items-end justify-between gap-4">
              <SectionHeading eyebrow="Modellen" title="Klaar om te printen." />
              <Link
                href="/modellen"
                className="shrink-0 text-sm font-medium text-violet-700 hover:underline"
              >
                Bekijk alle modellen →
              </Link>
            </div>
            {error ? (
              <p className="mt-8 text-red-700">{error.message}</p>
            ) : productList.length === 0 ? (
              <p className="mt-8 max-w-xl text-slate-600">
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
      </main>

      <SiteFooter />
    </div>
  );
}
