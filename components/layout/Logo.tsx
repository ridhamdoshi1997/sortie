import Link from "next/link";

type Props = {
  href?: string;
  priority?: boolean;
  variant?: "dark" | "light";
};

export function Logo({ href = "/", variant = "dark" }: Props) {
  const isLight = variant === "light";

  return (
    <Link
      href={href}
      aria-label="Sortie home"
      className={`inline-flex items-baseline gap-2.5 ${isLight ? "text-overlay-foreground" : "text-text-primary"}`}
    >
      <span className="text-lg leading-none text-accent" aria-hidden="true">
        &#9670;
      </span>
      <span className="font-display text-[19px] font-bold uppercase leading-7 tracking-wide">
        Sortie
      </span>
      <span
        className={`font-mono text-[11px] font-normal uppercase leading-none tracking-widest ${
          isLight ? "text-overlay-foreground/50" : "text-text-muted"
        }`}
        aria-hidden="true"
      >
        SRT&nbsp;&middot;&nbsp;01
      </span>
    </Link>
  );
}
