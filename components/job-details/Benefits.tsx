import { Gift, Sparkle } from "lucide-react";

type Props = {
  items: string[];
};

export function Benefits({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <Gift className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Benefits</h2>
      </div>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-text-primary">
            <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />
            <span className="font-medium">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
