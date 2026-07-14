"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IconPencil, IconUpload } from "@/components/ui/icons";
import { CubeLogo } from "@/components/site-header";
import { formatEuro, formatFileSize } from "@/lib/format";
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

export type FormType = "catalog" | "file" | "custom";

const initialState: SubmitState = { errors: null };

// The three request types as selectable cards (spec: bare radios read as
// scam-like). Semantically still radio inputs, so nothing changes for the
// server action.
const TYPE_OPTIONS = [
  {
    value: "catalog",
    label: "Kant-en-klaar ontwerp",
    sub: "Kies een model uit de catalogus",
    Icon: CubeLogo,
  },
  {
    value: "file",
    label: "Print mijn bestand",
    sub: "Upload je eigen .stl/.3mf/.step",
    Icon: IconUpload,
  },
  {
    value: "custom",
    label: "Eigen ontwerp",
    sub: "Wij ontwerpen het samen met jou",
    Icon: IconPencil,
  },
] as const;

export function RequestForm({
  products,
  preselectedProductId,
  initialType,
}: {
  products: ProductOption[];
  preselectedProductId: string;
  initialType: FormType | "";
}) {
  const [state, formAction, actionPending] = useActionState(
    submitRequest,
    initialState
  );
  // ?product= implies catalog and wins over ?type=; default stays "file".
  const [type, setType] = useState<FormType>(
    preselectedProductId ? "catalog" : initialType || "file"
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Honeypot: invisible to humans, bots fill it. Kept out of view,
          tab order and screen readers. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Wat wil je aanvragen?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map(({ value, label, sub, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${
                type === value
                  ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600"
                  : "border-slate-300 hover:border-violet-400"
              }`}
            >
              <span className="flex items-center justify-between">
                <Icon
                  className={`h-6 w-6 ${
                    type === value ? "text-violet-700" : "text-slate-400"
                  }`}
                />
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="accent-violet-600"
                />
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {label}
              </span>
              <span className="text-xs text-slate-500">{sub}</span>
            </label>
          ))}
        </div>
        {errors.type && <p className="mt-2 text-sm text-red-600">{errors.type}</p>}
      </fieldset>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Jouw gegevens
        </h2>
        <Field label="Naam" error={errors.customerName}>
          <Input type="text" name="customerName" required />
        </Field>
        <Field label="E-mailadres" error={errors.email}>
          <Input type="email" name="email" required />
        </Field>
        <Field label="Telefoonnummer (optioneel)">
          <Input type="tel" name="phone" />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Wat wil je printen?
        </h2>

        {type === "catalog" && (
          <Field label="Product" error={errors.productId}>
            <Select name="productId" defaultValue={preselectedProductId}>
              <option value="">— Kies een product —</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.indicative_price !== null &&
                    ` (richtprijs ${formatEuro(product.indicative_price)})`}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {type === "file" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">
              Bestanden
            </span>
            {/* Deliberately no `name`: the bytes must never end up in the
                FormData the server action receives. */}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-violet-400 hover:bg-violet-50">
              <IconUpload className="h-8 w-8 text-violet-600" />
              <span className="text-sm font-medium text-slate-700">
                Kies bestanden
              </span>
              <span className="text-xs text-slate-500">
                Max {MAX_FILES} bestanden · .stl, .3mf, .step, .stp · max 50MB
                per stuk
              </span>
              <input
                type="file"
                multiple
                accept=".stl,.3mf,.step,.stp"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
                className="sr-only"
              />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {files.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="truncate text-slate-900">{file.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500">
                      {formatFileSize(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {errors.files && (
              <p className="text-sm text-red-600">{errors.files}</p>
            )}
          </div>
        )}

        <Field
          label={
            type === "custom"
              ? "Omschrijving (afmetingen, doel)"
              : "Omschrijving (optioneel)"
          }
          error={errors.description}
        >
          <Textarea name="description" rows={4} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kleur (optioneel)">
            <Input type="text" name="color" />
          </Field>
          {(type === "file" || type === "custom") && (
            <Field label="Materiaal (optioneel)">
              <Input type="text" name="material" />
            </Field>
          )}
          {(type === "catalog" || type === "file") && (
            <Field label="Aantal" error={errors.quantity}>
              <Input type="number" name="quantity" min={1} defaultValue={1} />
            </Field>
          )}
        </div>

        {type === "file" && (
          <>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="licenseAccepted"
                className="mt-1 accent-violet-600"
              />
              <span className="text-sm text-slate-700">
                Dit is mijn eigen ontwerp, of de licentie staat commercieel
                printen toe.
              </span>
            </label>
            {errors.licenseAccepted && (
              <p className="text-sm text-red-600">{errors.licenseAccepted}</p>
            )}
          </>
        )}
      </div>

      {clientError && <p className="text-sm text-red-600">{clientError}</p>}
      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {isUploading
          ? "Bestanden uploaden…"
          : actionPending
            ? "Versturen…"
            : "Aanvraag versturen"}
      </Button>
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
