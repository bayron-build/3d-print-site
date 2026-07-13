"use client";

import { useActionState, useState, useTransition } from "react";
import { formatEuro } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_FILES,
  sanitizeFileName,
  validateRequest,
  type FileMeta,
  type RequestInput,
} from "@/lib/requests/validation";
import {
  submitRequest,
  type SubmitState,
  type UploadedFile,
} from "./actions";

export type ProductOption = {
  id: string;
  name: string;
  indicative_price: number | null;
};

type FormType = "catalog" | "file" | "custom";

const initialState: SubmitState = { errors: null };

const inputClass = "rounded border border-gray-300 px-3 py-2";
const labelClass = "flex flex-col gap-1";
const errorClass = "text-sm text-red-700";

export function RequestForm({
  products,
  preselectedProductId,
}: {
  products: ProductOption[];
  preselectedProductId: string;
}) {
  const [state, formAction, actionPending] = useActionState(
    submitRequest,
    initialState
  );
  const [type, setType] = useState<FormType>(
    preselectedProductId ? "catalog" : "file"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<
    string,
    string
  > | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();

  const pending = actionPending || isUploading;
  // Client validation errors take precedence: they reflect the latest submit
  // attempt before the action round-trips.
  const errors = clientErrors ?? state.errors ?? {};

  // Submit is intercepted so uploads can happen BEFORE the server action
  // runs: file bytes go browser → storage, only their metadata rides along
  // in the action's FormData.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);
    setClientErrors(null);

    const formData = new FormData(event.currentTarget);

    // Run the full shared validation client-side BEFORE any upload: a blank
    // name/email must not orphan uploaded objects (anon has no delete, and
    // each retry re-uploads under a fresh groupId). Same field coercions the
    // server action uses.
    const input: RequestInput = {
      type: String(formData.get("type") ?? ""),
      customerName: String(formData.get("customerName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      description: String(formData.get("description") ?? ""),
      color: String(formData.get("color") ?? ""),
      material: String(formData.get("material") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      licenseAccepted: formData.get("licenseAccepted") === "on",
      files: files.map((file): FileMeta => ({
        name: file.name,
        sizeBytes: file.size,
      })),
    };
    const result = validateRequest(input);
    if (!result.ok) {
      setClientErrors(result.errors);
      return;
    }

    let uploaded: UploadedFile[] = [];
    if (type === "file") {
      setIsUploading(true);
      try {
        uploaded = await uploadFiles(files);
      } catch {
        setClientError(
          "Uploaden mislukt, controleer je verbinding en probeer het opnieuw."
        );
        return;
      } finally {
        setIsUploading(false);
      }
    }

    formData.set("uploadedFiles", JSON.stringify(uploaded));
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot: invisible to humans, bots fill it. Kept out of view,
          tab order and screen readers. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Wat wil je aanvragen?</legend>
        {(
          [
            ["catalog", "Kant-en-klaar ontwerp"],
            ["file", "Print mijn bestand"],
            ["custom", "Eigen ontwerp"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
            />
            {label}
          </label>
        ))}
        {errors.type && <p className={errorClass}>{errors.type}</p>}
      </fieldset>

      <label className={labelClass}>
        <span className="text-sm font-medium">Naam</span>
        <input type="text" name="customerName" required className={inputClass} />
        {errors.customerName && (
          <p className={errorClass}>{errors.customerName}</p>
        )}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">E-mailadres</span>
        <input type="email" name="email" required className={inputClass} />
        {errors.email && <p className={errorClass}>{errors.email}</p>}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Telefoonnummer (optioneel)</span>
        <input type="tel" name="phone" className={inputClass} />
      </label>

      {type === "catalog" && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Product</span>
          <select
            name="productId"
            defaultValue={preselectedProductId}
            className={inputClass}
          >
            <option value="">— Kies een product —</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.indicative_price !== null &&
                  ` (richtprijs ${formatEuro(product.indicative_price)})`}
              </option>
            ))}
          </select>
          {errors.productId && <p className={errorClass}>{errors.productId}</p>}
        </label>
      )}

      {type === "file" && (
        <div className={labelClass}>
          <span className="text-sm font-medium">
            Bestanden (max {MAX_FILES}, .stl/.3mf/.step/.stp, max 50MB per
            stuk)
          </span>
          {/* Deliberately no `name`: the bytes must never end up in the
              FormData the server action receives. */}
          <input
            type="file"
            multiple
            accept=".stl,.3mf,.step,.stp"
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            className={inputClass}
          />
          {errors.files && <p className={errorClass}>{errors.files}</p>}
        </div>
      )}

      <label className={labelClass}>
        <span className="text-sm font-medium">
          {type === "custom"
            ? "Omschrijving (afmetingen, doel)"
            : "Omschrijving (optioneel)"}
        </span>
        <textarea name="description" rows={4} className={inputClass} />
        {errors.description && (
          <p className={errorClass}>{errors.description}</p>
        )}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Kleur (optioneel)</span>
        <input type="text" name="color" className={inputClass} />
      </label>

      {(type === "file" || type === "custom") && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Materiaal (optioneel)</span>
          <input type="text" name="material" className={inputClass} />
        </label>
      )}

      {(type === "catalog" || type === "file") && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Aantal</span>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={1}
            className={inputClass}
          />
          {errors.quantity && <p className={errorClass}>{errors.quantity}</p>}
        </label>
      )}

      {type === "file" && (
        <>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="licenseAccepted" className="mt-1" />
            <span className="text-sm">
              Dit is mijn eigen ontwerp, of de licentie staat commercieel
              printen toe.
            </span>
          </label>
          {errors.licenseAccepted && (
            <p className={errorClass}>{errors.licenseAccepted}</p>
          )}
        </>
      )}

      {clientError && <p className={errorClass}>{clientError}</p>}
      {errors.form && <p className={errorClass}>{errors.form}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isUploading
          ? "Bestanden uploaden…"
          : actionPending
            ? "Versturen…"
            : "Aanvraag versturen"}
      </button>
    </form>
  );
}

// Files go browser → Supabase Storage directly: a 50MB model can never
// travel through a server action (1MB default limit, ~4.5MB Vercel cap).
// The anon storage policy allows insert only — never read/list/delete.
async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const supabase = createClient();
  const groupId = crypto.randomUUID();

  const uploaded: UploadedFile[] = [];
  for (const [index, file] of files.entries()) {
    // Random folder per submission; index prefix avoids collisions when
    // two files sanitize to the same name.
    const storagePath = `${groupId}/${index}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from("request-files")
      .upload(storagePath, file);
    if (error) {
      throw error;
    }
    uploaded.push({
      storagePath,
      originalName: file.name,
      sizeBytes: file.size,
    });
  }
  return uploaded;
}
