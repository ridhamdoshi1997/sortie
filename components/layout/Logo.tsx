import Link from "next/link";

type Props = {
  href?: string;
  priority?: boolean;
};

export function Logo({ href = "/" }: Props) {
  return (
    <Link
      href={href}
      aria-label="Sortie home"
      className="inline-flex items-baseline gap-1.5 text-text-primary"
    >
      <span className="text-lg leading-none text-accent" aria-hidden="true">
        &#9670;
      </span>
      <span className="text-[19px] font-bold leading-7 tracking-tight">Sortie</span>
    </Link>
  );
}
