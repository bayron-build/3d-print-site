"use client";

import { useActionState } from "react";
import type { ProductFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export type ProductFormValues = {
  name: string;
  description: string;
  indicativePrice: string;
  active: boolean;
};

const initialState: ProductFormState = { errors: null, ok: false };

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
    <form action={formAction} className="flex flex-col gap-4">
      {productId && (
        <input type="hidden" name="productId" value={productId} />
      )}

      <Field label="Naam" error={errors.name}>
        <Input type="text" name="name" defaultValue={initial.name} required />
      </Field>

      <Field label="Omschrijving (optioneel)">
        <Textarea name="description" rows={5} defaultValue={initial.description} />
      </Field>

      <Field label="Richtprijs (€, optioneel)" error={errors.indicativePrice}>
        <Input
          type="text"
          name="indicativePrice"
          inputMode="decimal"
          defaultValue={initial.indicativePrice}
          placeholder="bijv. 12,50"
        />
      </Field>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial.active}
          className="accent-violet-600"
        />
        <span className="text-sm">Actief (zichtbaar in de catalogus)</span>
      </label>

      {errors.form && <p className="text-sm text-red-600 dark:text-red-400">{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400">Opgeslagen.</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig…" : submitLabel}
      </Button>
    </form>
  );
}
