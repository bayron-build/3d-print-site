import { describe, expect, it } from "vitest";
import {
  confirmationEmail,
  doneEmail,
  emailForStatusChange,
  ownerNotificationEmail,
  quoteEmail,
  rejectedEmail,
  type QuoteEmailInput,
} from "./templates";

const STATUS_URL =
  "https://example.com/aanvraag/status/00000000-0000-0000-0000-000000000000";

function quoteInput(overrides: Partial<QuoteEmailInput> = {}): QuoteEmailInput {
  return {
    customerName: "Jan",
    designFee: 15,
    printFee: "7.25",
    statusUrl: STATUS_URL,
    ...overrides,
  };
}

describe("confirmationEmail", () => {
  it("has the Dutch subject and links to the status page", () => {
    const email = confirmationEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("We hebben je aanvraag ontvangen");
    expect(email.html).toContain(STATUS_URL);
    expect(email.html).toContain("Jan");
  });

  it("escapes HTML in the customer name", () => {
    const email = confirmationEmail({
      customerName: "<script>alert(1)</script>",
      statusUrl: STATUS_URL,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("confirmationEmail — fixed-price order", () => {
  const order = { unitPrice: "12.50", quantity: 3 };

  it("shows unit price, quantity and total", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.subject).toBe("We hebben je bestelling ontvangen");
    // Bound to their labels: a bare "€ 12,50" would still match if per-stuk
    // and totaal were swapped, and that distinction is the point of this email.
    expect(email.html).toContain("Prijs per stuk: € 12,50");
    expect(email.html).toContain("Aantal: 3");
    expect(email.html).toContain("Totaal: € 37,50");
    expect(email.html).toContain(STATUS_URL);
  });

  it("does not promise a quote", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.html).not.toContain("prijsvoorstel");
  });

  // The commercial core of this branch: the price is final and no offerte
  // follows. not.toContain("prijsvoorstel") passes if it were deleted entirely.
  it("states the price is fixed and no quote follows", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.html).toContain(
      "Dit is een vaste prijs, je hoeft geen offerte af te wachten."
    );
  });

  it("escapes HTML in the customer name", () => {
    const email = confirmationEmail({
      customerName: "<script>alert(1)</script>",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("keeps the quote-flow wording when there is no order", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
    });
    expect(email.subject).toBe("We hebben je aanvraag ontvangen");
    expect(email.html).toContain("prijsvoorstel");
  });

  it("shows the chosen color when present and omits the line when absent", () => {
    const withColor = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.com/s/t",
      order: { unitPrice: 10, quantity: 1, color: "PLA Basic – Black" },
    });
    expect(withColor.html).toContain("Kleur: PLA Basic – Black");

    const withoutColor = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.com/s/t",
      order: { unitPrice: 10, quantity: 1 },
    });
    expect(withoutColor.html).not.toContain("Kleur:");
  });
});

describe("quoteEmail", () => {
  it("shows both fees, the total, and the status link", () => {
    const email = quoteEmail(quoteInput());
    expect(email.subject).toBe("Je offerte staat klaar");
    expect(email.html).toContain("€ 15,00");
    expect(email.html).toContain("€ 7,25");
    expect(email.html).toContain("€ 22,25");
    expect(email.html).toContain(STATUS_URL);
  });

  it("omits a fee line when that fee is not set", () => {
    const email = quoteEmail(quoteInput({ designFee: null }));
    expect(email.html).not.toContain("Ontwerpkosten");
    expect(email.html).toContain("€ 7,25");
  });
});

describe("doneEmail", () => {
  it("has the Dutch subject, the link, and a pickup/payment note", () => {
    const email = doneEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("Je print is klaar");
    expect(email.html).toContain(STATUS_URL);
    expect(email.html).toContain("Tikkie");
  });
});

describe("rejectedEmail", () => {
  it("has the Dutch subject and the link", () => {
    const email = rejectedEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("Over je aanvraag");
    expect(email.html).toContain(STATUS_URL);
  });
});

describe("emailForStatusChange", () => {
  it("returns the right template per emailing status", () => {
    expect(emailForStatusChange("quoted", quoteInput())?.subject).toBe(
      "Je offerte staat klaar"
    );
    expect(emailForStatusChange("done", quoteInput())?.subject).toBe(
      "Je print is klaar"
    );
    expect(emailForStatusChange("rejected", quoteInput())?.subject).toBe(
      "Over je aanvraag"
    );
  });

  it("returns null for statuses that send no email", () => {
    expect(emailForStatusChange("received", quoteInput())).toBeNull();
    expect(emailForStatusChange("approved", quoteInput())).toBeNull();
    expect(emailForStatusChange("printing", quoteInput())).toBeNull();
  });
});

describe("ownerNotificationEmail", () => {
  const ADMIN_URL =
    "https://example.com/admin/aanvragen/00000000-0000-0000-0000-000000000000";

  const catalogInput = {
    customerName: "Jan",
    email: "jan@example.com",
    phone: "0612345678",
    adminUrl: ADMIN_URL,
    order: { productName: "Vaas", unitPrice: "12.50", quantity: 3 },
  };

  const customInput = {
    customerName: "Jan",
    email: "jan@example.com",
    phone: null,
    adminUrl: ADMIN_URL,
    request: {
      description: "Een kapotte klink namaken",
      color: "Zwart",
      material: "PETG",
      quantity: 2,
      fileCount: 2,
    },
  };

  it("catalog: subject names the sender, body shows contact, product and totals", () => {
    const email = ownerNotificationEmail(catalogInput);
    expect(email.subject).toBe("Nieuwe bestelling van Jan");
    expect(email.html).toContain("jan@example.com");
    expect(email.html).toContain("0612345678");
    expect(email.html).toContain("Product: Vaas");
    expect(email.html).toContain("Aantal: 3");
    expect(email.html).toContain("Prijs per stuk: € 12,50");
    expect(email.html).toContain("Totaal: € 37,50");
    expect(email.html).toContain(ADMIN_URL);
  });

  it("custom/file: subject says aanvraag, body shows details and attachment count", () => {
    const email = ownerNotificationEmail(customInput);
    expect(email.subject).toBe("Nieuwe aanvraag van Jan");
    expect(email.html).toContain("Een kapotte klink namaken");
    expect(email.html).toContain("Kleur: Zwart");
    expect(email.html).toContain("Materiaal: PETG");
    expect(email.html).toContain("Aantal: 2");
    expect(email.html).toContain("Bijlagen: 2");
    expect(email.html).toContain(ADMIN_URL);
  });

  it("omits the phone line when phone is null", () => {
    const email = ownerNotificationEmail(customInput);
    expect(email.html).not.toContain("Telefoon");
  });

  it("omits empty detail lines (no description/color/material)", () => {
    const email = ownerNotificationEmail({
      ...customInput,
      request: {
        description: null,
        color: null,
        material: null,
        quantity: 1,
        fileCount: 1,
      },
    });
    expect(email.html).not.toContain("Omschrijving");
    expect(email.html).not.toContain("Kleur");
    expect(email.html).not.toContain("Materiaal");
  });

  it("escapes HTML in customer-supplied fields", () => {
    const email = ownerNotificationEmail({
      ...customInput,
      customerName: "<script>alert(1)</script>",
      request: { ...customInput.request, description: "<img src=x>" },
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });

  it("catalog: shows the chosen color when present", () => {
    const { html } = ownerNotificationEmail({
      ...catalogInput,
      order: {
        productName: "Vaas",
        unitPrice: 10,
        quantity: 2,
        color: "PLA Matte – Charcoal (niet op voorraad, langere levertijd)",
      },
    });
    expect(html).toContain(
      "Kleur: PLA Matte – Charcoal (niet op voorraad, langere levertijd)"
    );
  });
});

describe("version name in emails", () => {
  it("confirmation email lists the version", () => {
    const { html } = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.test/s/1",
      order: { unitPrice: "40.00", quantity: 1, versionName: "Dubbel" },
    });
    expect(html).toContain("Versie: Dubbel");
  });

  it("confirmation email omits the version line without one", () => {
    const { html } = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.test/s/1",
      order: { unitPrice: "23.00", quantity: 1 },
    });
    expect(html).not.toContain("Versie:");
  });

  it("owner notification joins product and version with an em-dash", () => {
    const { html } = ownerNotificationEmail({
      customerName: "Jan",
      email: "jan@example.test",
      phone: null,
      adminUrl: "https://example.test/admin/aanvragen/1",
      order: {
        productName: "Theedispenser",
        unitPrice: "40.00",
        quantity: 1,
        versionName: "Dubbel",
      },
    });
    expect(html).toContain("Product: Theedispenser (Dubbel)");
  });

  it("owner notification escapes the version name", () => {
    const { html } = ownerNotificationEmail({
      customerName: "Jan",
      email: "jan@example.test",
      phone: null,
      adminUrl: "https://example.test/admin/aanvragen/1",
      order: {
        productName: "Theedispenser",
        unitPrice: "40.00",
        quantity: 1,
        versionName: "<b>Dubbel</b>",
      },
    });
    expect(html).toContain("&lt;b&gt;Dubbel&lt;/b&gt;");
    expect(html).not.toContain("<b>Dubbel</b>");
  });
});
