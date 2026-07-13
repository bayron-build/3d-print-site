// Dutch customer email templates. Pure functions — no I/O, no env access —
// so each is unit-testable. Callers supply the absolute status-page URL;
// lib/email/notifications.ts builds it and hands the result to the transport.

import type { RequestStatus } from "@/lib/requests/status";

export type EmailContent = { subject: string; html: string };

// € 1.234,56 — Dutch grouping and comma decimals. Accepts the string form
// Postgres numeric columns may arrive in.
export function formatEuro(value: number | string): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const [whole, decimals] = amount.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${decimals}`;
}

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

export type ConfirmationEmailInput = {
  customerName: string;
  statusUrl: string;
};

export function confirmationEmail(
  input: ConfirmationEmailInput
): EmailContent {
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

function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}

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
