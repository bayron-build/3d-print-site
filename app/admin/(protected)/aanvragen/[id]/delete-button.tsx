"use client";

import { useState } from "react";
import { deleteRequest } from "./actions";

// Two-step delete: the first click reveals a confirm/cancel pair so a stray
// click cannot destroy a request and its files.
export function DeleteButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-3 rounded border border-red-300 px-4 py-2 text-sm text-red-700"
      >
        Aanvraag verwijderen
      </button>
    );
  }

  return (
    <form action={deleteRequest} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <span className="text-sm">Zeker weten?</span>
      <button
        type="submit"
        className="rounded bg-red-700 px-4 py-2 text-sm text-white"
      >
        Ja, verwijderen
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded border border-gray-300 px-4 py-2 text-sm"
      >
        Annuleren
      </button>
    </form>
  );
}
