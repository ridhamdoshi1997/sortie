import { ListOrdered } from "lucide-react";

type Props = {
  items: string[];
};

export function HiringProcess({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="glass-panel rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <ListOrdered className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Hiring Process</h2>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm font-medium leading-6 text-text-primary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}
