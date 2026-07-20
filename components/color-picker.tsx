"use client";

import { useState } from "react";
import {
  isNearWhite,
  lineLabel,
  OUT_OF_STOCK_NOTE,
  type FilamentColor,
} from "@/lib/colors";

// Bambu-style rows of round swatches, grouped per filament line. Controlled
// component: the parent owns the selected id (product page → Bestellen link,
// order form → hidden field). Public pages are light-mode only.
//
// The full palette is 55 swatches, which reads as overwhelming, so by default
// only the in-stock colors show and the rest sit behind "Meer kleuren". Every
// color stays orderable — this is presentation, not a filter. If the owner has
// nothing marked in stock, showing an empty picker would be worse than the
// long list, so that case falls back to the full palette.
export function ColorPicker({
  colors,
  selectedId,
  onSelect,
}: {
  colors: FilamentColor[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const inStock = colors.filter((color) => color.available);
  const collapsible = inStock.length > 0 && inStock.length < colors.length;
  const selected = colors.find((color) => color.id === selectedId);
  // A color arriving from ?color= (or the product page link) may live in the
  // hidden half; start expanded so the customer sees what is selected.
  const [expanded, setExpanded] = useState(
    selected !== undefined && !selected.available
  );

  if (colors.length === 0) return null;
  const visible = !collapsible || expanded ? colors : inStock;

  return (
    <div className="flex flex-col gap-3">
      {(["basic", "matte"] as const).map((line) => {
        const group = visible.filter((color) => color.line === line);
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
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="self-start text-sm font-medium text-violet-700 hover:underline"
        >
          {expanded
            ? "Minder kleuren tonen"
            : `Meer kleuren (${colors.length - inStock.length}, langere levertijd)`}
        </button>
      )}
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
