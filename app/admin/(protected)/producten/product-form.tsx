"use client";

import { useActionState } from "react";
import type { ProductFormState } from "./actions";

export type ProductFormValues = {
  name: string;
  description: string;
  indicativePrice: string;
  active: boolean;
};

const initialState: ProductFormState = { errors: null, ok: false };
const inputClass = "rounded border border-gray-300 px-3 py-2";
const labelClass = "flex flex-col gap-1";
const errorClass = "text-sm text-red-700";

// Shared by the create and edit pages; `productId` is only set when editing.
export function ProductForm({
  action,
  initial,
  productId,
  submitLabel,
}: {
  action: (
    state: ProductFormState,
    formData: FormData
  ) => Promise<ProductFormState>;
  initial: ProductFormValues;
  productId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {productId && (
        <input type="hidden" name="productId" value={productId} />
      )}

      <label className={labelClass}>
        <span className="text-sm font-medium">Naam</span>
        <input
          type="text"
          name="name"
          defaultValue={initial.name}
          required
          className={inputClass}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Omschrijving (optioneel)</span>
        <textarea
          name="description"
          rows={5}
          defaultValue={initial.description}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Richtprijs (€, optioneel)</span>
        <input
          type="text"
          name="indicativePrice"
          inputMode="decimal"
          defaultValue={initial.indicativePrice}
          placeholder="bijv. 12,50"
          className={inputClass}
        />
        {errors.indicativePrice && (
          <p className={errorClass}>{errors.indicativePrice}</p>
        )}
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial.active}
        />
        <span className="text-sm">Actief (zichtbaar in de catalogus)</span>
      </label>

      {errors.form && <p className={errorClass}>{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700">Opgeslagen.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Bezig…" : submitLabel}
      </button>
    </form>
  );
}
