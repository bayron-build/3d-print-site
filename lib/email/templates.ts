// Dutch customer email templates. Pure functions — no I/O, no env access —
// so each is unit-testable. Callers supply the absolute status-page URL;
// lib/email/notifications.ts builds it and hands the result to the transport.

import { formatEuro, toAmount } from "@/lib/format";
import type { RequestStatus } from "@/lib/requests/status";

export type EmailContent = { subject: string; html: string };

// Customer names end up inside HTML; neutralise markup no matter what was
// typed into the form.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(paragraphs: string[]): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;">${p}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:560px;">${body}</div>`;
}

function statusLink(statusUrl: string, label: string): string {
  return `<a href="${statusUrl}" style="color:#1d4ed8;">${label}</a>`;
}

// Fixed-price catalog orders put the price in the confirmation itself: the
// customer never gets a quote email, so this is their written price.
export type OrderSummary = {
  unitPrice: number | string;
  quantity: number;
};

export type ConfirmationEmailInput = {
  customerName: string;
  statusUrl: string;
  order?: OrderSummary;
};

export function confirmationEmail(
  input: ConfirmationEmailInput
): EmailContent {
  if (input.order) {
    const total = toAmount(input.order.unitPrice) * input.order.quantity;
    return {
      subject: "We hebben je bestelling ontvangen",
      html: layout([
        `Beste ${escapeHtml(input.customerName)},`,
        "Bedankt voor je bestelling! We hebben hem in goede orde ontvangen.",
        [
          `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
          `Aantal: ${input.order.quantity}`,
          `<strong>Totaal: ${formatEuro(total)}</strong>`,
        ].join("<br>"),
        "Dit is een vaste prijs — je hoeft geen offerte af te wachten. Betalen kan bij het ophalen, per bankoverschrijving of Tikkie.",
        `Via jouw persoonlijke pagina kun je de bestelling volgen: ${statusLink(
          input.statusUrl,
          "volg je bestelling"
        )}.`,
      ]),
    };
  }

  return {
    subject: "We hebben je aanvraag ontvangen",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Bedankt voor je aanvraag! We hebben hem in goede orde ontvangen.",
      `Via jouw persoonlijke pagina kun je de aanvraag volgen: ${statusLink(
        input.statusUrl,
        "volg je aanvraag"
      )}.`,
      "We bekijken je aanvraag en sturen je zo snel mogelijk per e-mail een prijsvoorstel.",
    ]),
  };
}

export type QuoteEmailInput = {
  customerName: string;
  designFee: number | string | null;
  printFee: number | string | null;
  statusUrl: string;
};

export function quoteEmail(input: QuoteEmailInput): EmailContent {
  const lines: string[] = [];
  if (input.designFee !== null) {
    lines.push(`Ontwerpkosten: ${formatEuro(input.designFee)}`);
  }
  if (input.printFee !== null) {
    lines.push(`Printkosten: ${formatEuro(input.printFee)}`);
  }
  const total = toAmount(input.designFee) + toAmount(input.printFee);
  lines.push(`<strong>Totaal: ${formatEuro(total)}</strong>`);

  return {
    subject: "Je offerte staat klaar",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Goed nieuws: je offerte staat klaar.",
      lines.join("<br>"),
      `Bekijk de offerte en geef akkoord via ${statusLink(
        input.statusUrl,
        "je statuspagina"
      )}.`,
    ]),
  };
}

export function doneEmail(input: ConfirmationEmailInput): EmailContent {
  return {
    subject: "Je print is klaar",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Goed nieuws: je print is klaar!",
      "We nemen contact met je op over het ophalen. Betalen kan per bankoverschrijving of Tikkie.",
      `Bekijk de details op ${statusLink(input.statusUrl, "je statuspagina")}.`,
    ]),
  };
}

export function rejectedEmail(input: ConfirmationEmailInput): EmailContent {
  return {
    subject: "Over je aanvraag",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "We hebben goed naar je aanvraag gekeken, maar kunnen deze helaas niet uitvoeren. Onze excuses voor het ongemak.",
      `De details vind je op ${statusLink(input.statusUrl, "je statuspagina")}.`,
      "Heb je vragen? Beantwoord dan gerust deze e-mail.",
    ]),
  };
}

// Owner notification: sent to ADMIN_EMAIL on every new submission so the
// inbox answers "who and what" without opening the admin site. Subjects are
// plain text (no HTML escaping); everything in the body is escaped.
export type OwnerNotificationInput = {
  customerName: string;
  email: string;
  phone: string | null;
  adminUrl: string;
  // Exactly one of the two below is set: `order` for catalog, `request` for custom/file.
  order?: { productName: string; unitPrice: number | string; quantity: number };
  request?: {
    description: string | null;
    color: string | null;
    material: string | null;
    quantity: number;
    fileCount: number;
  };
};

export function ownerNotificationEmail(
  input: OwnerNotificationInput
): EmailContent {
  const contact = [
    `Naam: ${escapeHtml(input.customerName)}`,
    `E-mail: ${escapeHtml(input.email)}`,
  ];
  if (input.phone !== null) {
    contact.push(`Telefoon: ${escapeHtml(input.phone)}`);
  }

  const details: string[] = [];
  if (input.order) {
    const total = toAmount(input.order.unitPrice) * input.order.quantity;
    details.push(
      `Product: ${escapeHtml(input.order.productName)}`,
      `Aantal: ${input.order.quantity}`,
      `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
      `<strong>Totaal: ${formatEuro(total)}</strong>`
    );
  } else if (input.request) {
    if (input.request.description !== null) {
      details.push(`Omschrijving: ${escapeHtml(input.request.description)}`);
    }
    if (input.request.color !== null) {
      details.push(`Kleur: ${escapeHtml(input.request.color)}`);
    }
    if (input.request.material !== null) {
      details.push(`Materiaal: ${escapeHtml(input.request.material)}`);
    }
    details.push(`Aantal: ${input.request.quantity}`);
    details.push(`Bijlagen: ${input.request.fileCount}`);
  }

  return {
    subject: input.order
      ? `Nieuwe bestelling van ${input.customerName}`
      : `Nieuwe aanvraag van ${input.customerName}`,
    html: layout([
      input.order
        ? "Er is een nieuwe bestelling binnengekomen."
        : "Er is een nieuwe aanvraag binnengekomen.",
      contact.join("<br>"),
      details.join("<br>"),
      `Bekijk de details in het ${statusLink(input.adminUrl, "beheer")}.`,
    ]),
  };
}

// One entry point for "the status changed, which email (if any) goes out?".
// received/approved/printing deliberately send nothing: the status page
// already shows progress, and emailing every step is noise.
export function emailForStatusChange(
  status: RequestStatus,
  input: QuoteEmailInput
): EmailContent | null {
  switch (status) {
    case "quoted":
      return quoteEmail(input);
    case "done":
      return doneEmail({
        customerName: input.customerName,
        statusUrl: input.statusUrl,
      });
    case "rejected":
      return rejectedEmail({
        customerName: input.customerName,
        statusUrl: input.statusUrl,
      });
    default:
      return null;
  }
}
