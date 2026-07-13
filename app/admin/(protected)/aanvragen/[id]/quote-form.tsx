"use client";

import { useActionState, useState } from "react";
import {
  REQUEST_STATUSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";
import { updateRequest, type UpdateState } from "./actions";

const initialState: UpdateState = { errors: null, ok: false };

// Postgres returns numeric(10,2) as a string or number; show it with a Dutch
// comma so the admin edits the same format they read.
function feeToInput(value: number | string | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}

// Lenient client-side parse for the convenience total only — accepts comma or
// dot, treats empty/unparseable as no value. Not validation.
function parseFeeLoose(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function QuoteForm({
  requestId,
  designFee,
  printFee,
  status,
  notes,
}: {
  requestId: string;
  designFee: number | string | null;
  printFee: number | string | null;
  status: RequestStatus;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateRequest,
    initialState
  );
  const errors = state.errors ?? {};

  const [designFeeInput, setDesignFeeInput] = useState(feeToInput(designFee));
  const [printFeeInput, setPrintFeeInput] = useState(feeToInput(printFee));

  const designAmount = parseFeeLoose(designFeeInput);
  const printAmount = parseFeeLoose(printFeeInput);
  const hasTotal = designAmount !== null || printAmount !== null;
  const total = (designAmount ?? 0) + (printAmount ?? 0);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Ontwerpkosten (€)</span>
          <input
            type="text"
            name="designFee"
            inputMode="decimal"
            value={designFeeInput}
            onChange={(e) => setDesignFeeInput(e.target.value)}
            placeholder="bijv. 15,00"
            className="rounded border border-gray-300 px-3 py-2"
          />
          {errors.designFee && (
            <span className="text-sm text-red-700">{errors.designFee}</span>
          )}
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Printkosten (€)</span>
          <input
            type="text"
            name="printFee"
            inputMode="decimal"
            value={printFeeInput}
            onChange={(e) => setPrintFeeInput(e.target.value)}
            placeholder="bijv. 7,50"
            className="rounded border border-gray-300 px-3 py-2"
          />
          {errors.printFee && (
            <span className="text-sm text-red-700">{errors.printFee}</span>
          )}
        </label>
      </div>

      {hasTotal && (
        <p className="text-sm text-gray-600">
          Totaal: € {total.toFixed(2).replace(".", ",")}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {errors.status && (
          <span className="text-sm text-red-700">{errors.status}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notities (intern)</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      {errors.form && <p className="text-sm text-red-700">{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700">Opgeslagen.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Bezig met opslaan…" : "Opslaan"}
      </button>
    </form>
  );
}
