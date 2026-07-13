import { describe, expect, it } from "vitest";
import {
  confirmationEmail,
  doneEmail,
  emailForStatusChange,
  formatEuro,
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

describe("formatEuro", () => {
  it("formats numbers Dutch-style with two decimals", () => {
    expect(formatEuro(12.5)).toBe("€ 12,50");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(7)).toBe("€ 7,00");
  });

  it("accepts the string form Postgres numeric may arrive in", () => {
    expect(formatEuro("12.50")).toBe("€ 12,50");
  });

  it("groups thousands with a dot", () => {
    expect(formatEuro(1234.5)).toBe("€ 1.234,50");
  });
});

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
