"use client";

import {
  isNearWhite,
  lineLabel,
  OUT_OF_STOCK_NOTE,
  type FilamentColor,
} from "@/lib/colors";

// Bambu-style rows of round swatches, grouped per filament line. Controlled
// component: the parent owns the selected id (product page → Bestellen link,
// order form → hidden field). Public pages are light-mode only.
export function ColorPicker({
  colors,
  selectedId,
  onSelect,
}: {
  colors: FilamentColor[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (colors.length === 0) return null;
  const selected = colors.find((color) => color.id === selectedId);
  return (
    <div className="flex flex-col gap-3">
      {(["basic", "matte"] as const).map((line) => {
        const group = colors.filter((color) => color.line === line);
        if (group.length === 0) return null;
        return (
          <div key={line}>
            <p className="text-sm font-medium text-slate-700">
              {lineLabel(line)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {group.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => onSelect(color.id)}
                  title={color.name}
                  aria-label={`${lineLabel(line)} ${color.name}`}
                  aria-pressed={color.id === selectedId}
                  className={`h-7 w-7 rounded-full transition-shadow ${
                    isNearWhite(color.hex) ? "border border-slate-300" : ""
                  } ${
                    color.id === selectedId
                      ? "ring-2 ring-violet-600 ring-offset-2"
                      : "hover:ring-2 hover:ring-violet-300 hover:ring-offset-2"
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>
        );
      })}
      {selected && (
        <p className="text-sm">
          <span className="font-medium text-slate-900">
            {lineLabel(selected.line)} – {selected.name}
          </span>{" "}
          {selected.available ? (
            <span className="text-green-700">Op voorraad</span>
          ) : (
            <span className="block text-amber-700">{OUT_OF_STOCK_NOTE}</span>
          )}
        </p>
      )}
    </div>
  );
}
