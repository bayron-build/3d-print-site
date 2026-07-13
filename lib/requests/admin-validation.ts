// Pure validation for the admin quote form. No I/O, so it is unit-testable
// and could be reused client-side later. Mirrors lib/requests/validation.ts.

import { isRequestStatus, type RequestStatus } from "./status";

export type QuoteInput = {
  designFee: string;
  printFee: string;
  status: string;
  notes: string;
};

export type ValidQuote = {
  designFee: number | null;
  printFee: number | null;
  status: RequestStatus;
  notes: string | null;
};

export type QuoteValidationResult =
  | { ok: true; data: ValidQuote }
  | { ok: false; errors: Record<string, string> };

// A fee is optional (empty → null) or a non-negative amount with at most two
// decimals, using a dot or a Dutch comma as separator. Anything else is a
// validation error. No sign is allowed, so negatives are rejected by the
// pattern itself.
const FEE_PATTERN = /^\d+([.]\d{1,2})?$/;

export function parseFee(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const normalized = trimmed.replace(",", ".");
  if (!FEE_PATTERN.test(normalized)) {
    return { ok: false };
  }
  return { ok: true, value: Number.parseFloat(normalized) };
}

const FEE_ERROR = "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";

export function validateQuote(input: QuoteInput): QuoteValidationResult {
  const errors: Record<string, string> = {};

  const designFee = parseFee(input.designFee);
  if (!designFee.ok) {
    errors.designFee = FEE_ERROR;
  }

  const printFee = parseFee(input.printFee);
  if (!printFee.ok) {
    errors.printFee = FEE_ERROR;
  }

  if (!isRequestStatus(input.status)) {
    errors.status = "Kies een geldige status.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      designFee: designFee.ok ? designFee.value : null,
      printFee: printFee.ok ? printFee.value : null,
      status: input.status as RequestStatus,
      notes: input.notes.trim() || null,
    },
  };
}
