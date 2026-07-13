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
        className="rounded bg-green-700 px-6 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Bezig…" : "Akkoord"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
