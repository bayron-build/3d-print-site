"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteRequest } from "./actions";

// Two-step delete: the first click reveals a confirm/cancel pair so a stray
// click cannot destroy a request and its files.
export function DeleteButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="danger-outline"
        size="sm"
        onClick={() => setConfirming(true)}
        className="mt-3"
      >
        Aanvraag verwijderen
      </Button>
    );
  }

  return (
    <form action={deleteRequest} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <span className="text-sm">Zeker weten?</span>
      <Button type="submit" variant="danger" size="sm">
        Ja, verwijderen
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
  );
}
