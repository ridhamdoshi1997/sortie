import { ArrowRight } from "lucide-react";

type Props = {
  items: string[];
};

// Pane inside the shared "The Role" card — see JobDescription.tsx's comment
// for why this no longer carries its own border/shadow/icon-chip header.
export function Responsibilities({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border-light px-6 py-6">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Responsibilities
      </h3>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm font-medium leading-6 text-text-primary">
            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
