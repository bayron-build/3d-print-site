"use client";

import { useActionState, useState } from "react";
import {
  REQUEST_STATUSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
        <div className="flex-1">
          <Field label="Ontwerpkosten (€)" error={errors.designFee}>
            <Input
              type="text"
              name="designFee"
              inputMode="decimal"
              value={designFeeInput}
              onChange={(e) => setDesignFeeInput(e.target.value)}
              placeholder="bijv. 15,00"
            />
          </Field>
        </div>

        <div className="flex-1">
          <Field label="Printkosten (€)" error={errors.printFee}>
            <Input
              type="text"
              name="printFee"
              inputMode="decimal"
              value={printFeeInput}
              onChange={(e) => setPrintFeeInput(e.target.value)}
              placeholder="bijv. 7,50"
            />
          </Field>
        </div>
      </div>

      {hasTotal && (
        <p className="text-sm text-slate-600">
          Totaal: € {total.toFixed(2).replace(".", ",")}
        </p>
      )}

      <Field label="Status" error={errors.status}>
        <Select name="status" defaultValue={status}>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Notities (intern)">
        <Textarea name="notes" rows={3} defaultValue={notes ?? ""} />
      </Field>

      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700">Opgeslagen.</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig met opslaan…" : "Opslaan"}
      </Button>
    </form>
  );
}
