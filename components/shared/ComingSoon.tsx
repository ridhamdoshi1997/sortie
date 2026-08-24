import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ComingSoon({ icon: Icon, title, description }: Props) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-3xl flex-col items-center justify-center gap-4 p-4 text-center sm:p-6 lg:p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-secondary">
        <Icon className="h-6 w-6 text-accent" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
      <p className="max-w-md text-sm text-text-secondary sm:text-base">{description}</p>
    </main>
  );
}
