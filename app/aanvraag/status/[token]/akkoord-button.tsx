"use client";

import { useActionState } from "react";
import { approveQuote, type ApproveState } from "./actions";

const initialState: ApproveState = { error: null };

export function AkkoordButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    approveQuote,
    initialState
  );

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Bezig…" : "Akkoord"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
