"use client";

import { useState, useTransition } from "react";
import { toggleColorAvailability } from "./actions";

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// One button per color row. The server action revalidates the page, so the
// fresh `available` prop arrives via the RSC refresh — no local mirror state.
export function ColorToggle({
  colorId,
  available,
}: {
  colorId: string;
  available: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-3">
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await toggleColorAvailability(colorId, !available);
            if (!result.ok) {
              setError(GENERIC_ERROR);
            }
          })
        }
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          available
            ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        }`}
      >
        {available ? "Op voorraad" : "Niet op voorraad"}
      </button>
    </span>
  );
}
