import { Sparkle } from "lucide-react";

type Props = {
  items: string[];
};

// Pane inside the shared "The Role" card — see JobDescription.tsx's comment.
export function Benefits({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border-light px-6 py-6">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Benefits</h3>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-text-primary">
            <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />
            <span className="font-medium">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
