import { ListOrdered } from "lucide-react";

type Props = {
  items: string[];
};

export function HiringProcess({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <ListOrdered className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Hiring Process</h2>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item} className="flex items-start gap-3 text-sm font-medium leading-6 text-text-primary">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-muted font-mono text-[11px] font-semibold text-accent">
              {index + 1}
            </span>
            <span className="pt-0.5">{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
