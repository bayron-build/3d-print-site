"use client";

import { useActionState, useState } from "react";
import { deleteProduct, type DeleteProductState } from "../actions";
import { Button } from "@/components/ui/button";

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
        <Button
          type="button"
          variant="danger-outline"
          size="sm"
          onClick={() => setConfirming(true)}
          className="self-start"
        >
          Product verwijderen
        </Button>
      ) : (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="productId" value={productId} />
          <span className="text-sm">Zeker weten?</span>
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? "Bezig…" : "Ja, verwijderen"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Annuleren
          </Button>
        </form>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
