type Props = {
  items: string[];
};

// Pane inside the shared "The Role" card — see JobDescription.tsx's comment.
export function HiringProcess({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border-light px-6 py-6">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Hiring Process</h3>
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
    </div>
  );
}
