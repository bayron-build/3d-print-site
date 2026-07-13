import Link from "next/link";

export default function RequestSentPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Bedankt voor je aanvraag!</h1>
      <p className="max-w-md text-gray-600">
        We bekijken je aanvraag en nemen zo snel mogelijk per e-mail contact
        met je op met een prijsvoorstel.
      </p>
      <Link href="/" className="underline">
        Terug naar de homepagina
      </Link>
    </main>
  );
}
