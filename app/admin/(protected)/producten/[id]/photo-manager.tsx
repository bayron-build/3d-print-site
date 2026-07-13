"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_PHOTOS,
  PHOTO_EXTENSIONS,
  extensionOf,
  validatePhotos,
} from "@/lib/products/validation";
import { productPhotoUrl } from "@/lib/products/photos";
import { addProductPhoto, deleteProductPhoto } from "../actions";

// Photos upload browser → storage directly (same reason as the request
// form's model files: server actions cap out around 1MB on Vercel). The
// admin session's JWT satisfies the bucket's is_admin() insert policy.
export function PhotoManager({
  productId,
  photos,
}: {
  productId: string;
  photos: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleUpload() {
    const files = Array.from(inputRef.current?.files ?? []);
    setError(null);

    const validationError = validatePhotos(
      photos.length,
      files.map((file) => ({ name: file.name, sizeBytes: file.size }))
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      for (const file of files) {
        const path = `${productId}/${crypto.randomUUID()}${extensionOf(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("product-photos")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const result = await addProductPhoto(productId, path);
        if (!result.ok) throw new Error(result.message);
      }
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Uploaden mislukt, probeer het opnieuw.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(path: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductPhoto(productId, path);
      if (!result.ok) {
        setError(result.message ?? "Er ging iets mis.");
      }
    });
  }

  const busy = isUploading || isPending;

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Foto&apos;s</h2>
      <p className="text-sm text-gray-600">
        Max {MAX_PHOTOS} foto&apos;s ({PHOTO_EXTENSIONS.join(", ")}, max 10MB
        per stuk). De eerste foto is de omslagfoto in de catalogus.
      </p>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-4">
          {photos.map((path) => (
            <li key={path} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productPhotoUrl(path)}
                alt=""
                className="aspect-square w-full rounded border border-gray-200 object-cover"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(path)}
                className="text-sm text-red-700 underline disabled:opacity-50"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_EXTENSIONS.join(",")}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={handleUpload}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isUploading ? "Uploaden…" : "Foto's uploaden"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
