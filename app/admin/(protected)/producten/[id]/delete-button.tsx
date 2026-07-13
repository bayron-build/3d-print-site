"use client";

import { useActionState, useState } from "react";
import { deleteProduct, type DeleteProductState } from "../actions";

const initialState: DeleteProductState = { error: null };

// Two-step delete: the first click reveals a confirm/cancel pair so a stray
// click cannot destroy a product and its photos.
export function DeleteProductButton({ productId }: { productId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteProduct,
    initialState
  );

  return (
    <div className="flex flex-col gap-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded border border-red-300 px-4 py-2 text-sm text-red-700"
        >
          Product verwijderen
        </button>
      ) : (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="productId" value={productId} />
          <span className="text-sm">Zeker weten?</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Ja, verwijderen"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded border border-gray-300 px-4 py-2 text-sm"
          >
            Annuleren
          </button>
        </form>
      )}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </div>
  );
}
