import { ArrowRight, Briefcase } from "lucide-react";

type Props = {
  items: string[];
};

export function Responsibilities({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <Briefcase className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">
          Responsibilities
        </h2>
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm font-medium leading-6 text-text-primary">
            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
