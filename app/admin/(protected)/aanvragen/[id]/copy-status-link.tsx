"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Copy-to-clipboard needs a client component; the URL itself is computed
// server-side (statusPageUrl) and passed in as a prop.
export function CopyStatusLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reset the "Gekopieerd!" confirmation after a moment.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context);
      // the visible URL below remains selectable by hand.
      setFailed(true);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          {url}
        </code>
        <Button type="button" onClick={handleCopy} size="sm" className="shrink-0">
          {copied ? "Gekopieerd!" : "Kopieer link"}
        </Button>
      </div>
      {failed && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Kopiëren mislukt — selecteer de link hierboven handmatig.
        </p>
      )}
    </div>
  );
}
