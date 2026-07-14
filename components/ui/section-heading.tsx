// The mockup's eyebrow + title pattern ("HOE HET WERKT" / big bold title).
export function SectionHeading({
  eyebrow,
  title,
  className = "",
}: {
  eyebrow: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
