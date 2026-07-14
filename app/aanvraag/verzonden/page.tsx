import { ButtonLink } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Aanvraag verzonden" };

export default function RequestSentPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
            <IconCheck className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold text-slate-900">
            Bedankt voor je aanvraag!
          </h1>
          <p className="text-slate-600">
            We bekijken je aanvraag en nemen zo snel mogelijk per e-mail
            contact met je op met een prijsvoorstel.
          </p>
          <ButtonLink href="/" variant="secondary">
            Terug naar de homepagina
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
