"use client";

import { formatEuro } from "@/lib/format";
import type { VersionOption } from "@/lib/products/versions";

// Selectable version cards. First option is always the base price; a version
// with a compare-at price shows it struck through in gray beside the real
// price. Renders nothing for versionless products.
export function VersionPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: VersionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">Uitvoering</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600"
                  : "border-slate-300 hover:border-violet-400"
              }`}
            >
              <span className="text-sm font-semibold text-slate-900">
                {option.label}
              </span>
              <span className="text-sm text-slate-900">
                {option.compareAtPrice !== null && (
                  <s className="mr-1.5 text-slate-400">
                    {formatEuro(option.compareAtPrice)}
                  </s>
                )}
                <span className="font-semibold">
                  {formatEuro(option.price)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
