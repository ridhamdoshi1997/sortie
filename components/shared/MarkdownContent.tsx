import ReactMarkdown from "react-markdown";

// Shared between the admin CMS preview (components/admin/PageEditor.tsx)
// and the public page render (app/blog/[slug]/page.tsx) so what an admin
// previews is exactly what ships — one set of component overrides, not two
// copies that can drift. No @tailwindcss/typography plugin (not installed
// in this project) — hand-mapped to this app's own design tokens instead
// of a `prose` class that would render unstyled without the plugin.
export function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="text-sm leading-6 text-text-secondary">
      <ReactMarkdown
        components={{
          h1: (props) => <h1 className="mb-3 mt-6 text-xl font-semibold text-text-primary first:mt-0" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-5 text-lg font-semibold text-text-primary first:mt-0" {...props} />,
          h3: (props) => <h3 className="mb-1.5 mt-4 text-base font-semibold text-text-primary first:mt-0" {...props} />,
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          ul: (props) => <ul className="mb-3 ml-5 list-disc" {...props} />,
          ol: (props) => <ol className="mb-3 ml-5 list-decimal" {...props} />,
          li: (props) => <li className="mb-1" {...props} />,
          a: (props) => <a className="text-accent hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
          strong: (props) => <strong className="font-semibold text-text-primary" {...props} />,
          blockquote: (props) => <blockquote className="border-l-2 border-border pl-3 italic text-text-muted" {...props} />,
          code: (props) => <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-xs text-text-primary" {...props} />,
          hr: (props) => <hr className="my-6 border-border" {...props} />,
        }}
      >
        {markdown || "*Nothing to preview yet.*"}
      </ReactMarkdown>
    </div>
  );
}
