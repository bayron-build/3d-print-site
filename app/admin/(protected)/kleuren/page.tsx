import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { isNearWhite, lineLabel, type FilamentColor } from "@/lib/colors";
import { ColorToggle } from "./color-toggle";

export const metadata = { title: "Kleuren" };

export default async function AdminColorsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");

  if (error) {
    return <p className="text-red-700 dark:text-red-400">{error.message}</p>;
  }
  const colors: FilamentColor[] = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Kleuren
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Zet een kleur op &ldquo;op voorraad&rdquo; als je de filament in huis
          hebt. Kleuren die niet op voorraad zijn blijven bestelbaar, met een
          langere levertijd.
        </p>
      </div>
      {(["basic", "matte"] as const).map((line) => {
        const group = colors.filter((color) => color.line === line);
        if (group.length === 0) return null;
        return (
          <Card key={line} className="overflow-hidden p-0">
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {lineLabel(line)}
            </h2>
            <ul>
              {group.map((color) => (
                <li
                  key={color.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-slate-800"
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full ${
                      isNearWhite(color.hex)
                        ? "border border-slate-300 dark:border-slate-600"
                        : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">
                    {color.name}
                  </span>
                  <ColorToggle colorId={color.id} available={color.available} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
