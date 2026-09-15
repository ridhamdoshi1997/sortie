// A cover letter's salutation is its own field, printed by the document
// itself ("Hiring Team, {Company}" by default). The AI used to be told to open
// the body with "Dear Hiring Team," as well, so every generated letter greeted
// the reader twice. The prompts no longer ask for it; this removes it from
// letters that already have it, and guards against a model adding one anyway.

const GREETING_LINE = /^(dear|hello|hi|greetings|to whom it may concern)\b[^\n]{0,80}[,:!]?\s*$/i;

/** The letter body without a leading greeting paragraph. */
export function stripLeadingGreeting(body: string): string {
  const trimmed = body.replace(/^\s+/, "");
  const [first, ...rest] = trimmed.split(/\n/);
  if (!first || !GREETING_LINE.test(first.trim())) return body;
  return rest.join("\n").replace(/^\s+/, "");
}
