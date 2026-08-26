"use client";

import { useState } from "react";

// Shared small form primitives — originally lived only inside ProfileForm.tsx;
// extracted here so the résumé editor's Skills/Education section editors can
// reuse the exact same input styling instead of duplicating it.

export const DEGREE_OPTIONS = ["High School", "Associate's", "Bachelor's", "Master's", "Ph.D.", "MBA", "Bootcamp / Certificate"];

export function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">
      {children}
    </label>
  );
}

export function FormInput({
  placeholder,
  value,
  onChange,
  readOnly,
  type = "text",
  icon: Icon,
}: {
  placeholder?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  type?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-shadow focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface-secondary read-only:bg-surface-secondary read-only:text-text-secondary"
        />
      </div>
    );
  }

  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-shadow focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface-secondary read-only:bg-surface-secondary read-only:text-text-secondary"
    />
  );
}

export function FormSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition-shadow focus:outline-none focus:ring-1 focus:ring-accent"
    >
      {placeholder && (
        <option value="" disabled className="bg-surface text-text-primary">
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-surface text-text-primary">
          {opt}
        </option>
      ))}
    </select>
  );
}

export function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-shadow focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary"
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-medium text-accent transition-transform hover:scale-105"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-0.5 leading-none hover:text-accent-dark"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
