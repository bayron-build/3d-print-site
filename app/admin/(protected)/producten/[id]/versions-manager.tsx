"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatEuro } from "@/lib/format";
import { priceToInput } from "@/lib/products/validation";
import { productPhotoUrl } from "@/lib/products/photos";
import {
  MAX_VERSION_NAME_LENGTH,
  type ProductVersion,
} from "@/lib/products/versions";
import {
  deleteVersion,
  moveVersion,
  saveVersion,
  type VersionFormState,
} from "./version-actions";

const initialState: VersionFormState = { errors: null, ok: false };

// List + add/edit form for a product's versions. One form serves both modes:
// picking "Bewerken" fills it (keyed remount resets the uncontrolled
// defaults), a successful save switches back to add mode.
export function VersionsManager({
  productId,
  photos,
  versions,
}: {
  productId: string;
  photos: string[];
  versions: ProductVersion[];
}) {
  const [state, formAction, formPending] = useActionState(
    saveVersion,
    initialState
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A successful save closes the edit form; the refreshed list shows the result.
  // Syncing local edit-mode UI to the action result is the intended use here;
  // the setState is guarded by state.ok so it cannot loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setEditingId(null);
  }, [state]);

  const editing = versions.find((version) => version.id === editingId);
  const errors = state.errors ?? {};
  const busy = formPending || isPending;

  function handleDelete(versionId: string) {
    setListError(null);
    startTransition(async () => {
      const result = await deleteVersion(productId, versionId);
      if (!result.ok) setListError(result.message ?? "Er ging iets mis.");
    });
  }

  function handleMove(versionId: string, direction: "up" | "down") {
    setListError(null);
    startTransition(async () => {
      const result = await moveVersion(productId, versionId, direction);
      if (!result.ok) setListError(result.message ?? "Er ging iets mis.");
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        Uitvoeringen
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Optioneel: extra uitvoeringen met een eigen prijs (bijv. dubbel). De
        basisprijs hierboven blijft de eerste keuze; het veld &quot;Label
        basisprijs&quot; bepaalt hoe die keuze heet. Verwijderen verandert
        bestaande bestellingen niet.
      </p>

      {versions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {versions.map((version, index) => (
            <li
              key={version.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              {version.photo_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productPhotoUrl(version.photo_path)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded border border-dashed border-slate-300 dark:border-slate-700" />
              )}
              <span className="flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {version.name}
              </span>
              <span className="shrink-0 text-sm text-slate-900 dark:text-white">
                {version.compare_at_price !== null && (
                  <s className="mr-1 text-slate-400 dark:text-slate-500">
                    {formatEuro(version.compare_at_price)}
                  </s>
                )}
                {formatEuro(version.price)}
              </span>
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => handleMove(version.id, "up")}
                aria-label={`${version.name} omhoog`}
                className="text-sm text-slate-600 hover:text-violet-700 disabled:opacity-40 dark:text-slate-300 dark:hover:text-violet-400"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === versions.length - 1}
                onClick={() => handleMove(version.id, "down")}
                aria-label={`${version.name} omlaag`}
                className="text-sm text-slate-600 hover:text-violet-700 disabled:opacity-40 dark:text-slate-300 dark:hover:text-violet-400"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingId(version.id)}
                className="text-sm text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-400"
              >
                Bewerken
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(version.id)}
                className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
      {listError && (
        <p className="text-sm text-red-600 dark:text-red-400">{listError}</p>
      )}

      <form
        key={editingId ?? "new"}
        action={formAction}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {editing ? "Uitvoering bewerken" : "Uitvoering toevoegen"}
        </h3>
        <input type="hidden" name="productId" value={productId} />
        {editing && (
          <input type="hidden" name="versionId" value={editing.id} />
        )}

        <Field label="Naam (bijv. Dubbel)" error={errors.name}>
          <Input
            type="text"
            name="name"
            defaultValue={editing?.name ?? ""}
            maxLength={MAX_VERSION_NAME_LENGTH}
            required
          />
        </Field>

        <Field label="Prijs (€)" error={errors.price}>
          <Input
            type="text"
            name="price"
            inputMode="decimal"
            defaultValue={editing ? priceToInput(editing.price) : ""}
            placeholder="bijv. 40,00"
          />
        </Field>

        <Field
          label="Oorspronkelijke prijs (optioneel — doorgestreept getoond)"
          error={errors.compareAtPrice}
        >
          <Input
            type="text"
            name="compareAtPrice"
            inputMode="decimal"
            defaultValue={editing ? priceToInput(editing.compare_at_price) : ""}
            placeholder="bijv. 46,00"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Foto (optioneel — wordt de omslagfoto als de klant deze uitvoering
            kiest)
          </legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Geen
              </span>
              <input
                type="radio"
                name="photoPath"
                value=""
                defaultChecked={!editing?.photo_path}
                className="accent-violet-600"
              />
            </label>
            {photos.map((path) => (
              <label
                key={path}
                className="flex cursor-pointer flex-col items-center gap-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productPhotoUrl(path)}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
                <input
                  type="radio"
                  name="photoPath"
                  value={path}
                  defaultChecked={editing?.photo_path === path}
                  className="accent-violet-600"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {errors.form && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.form}
          </p>
        )}
        {state.ok && (
          <p className="text-sm text-green-700 dark:text-green-400">
            Opgeslagen.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy} size="sm">
            {formPending ? "Bezig…" : editing ? "Opslaan" : "Toevoegen"}
          </Button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-sm text-slate-600 hover:underline dark:text-slate-300"
            >
              Annuleren
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
