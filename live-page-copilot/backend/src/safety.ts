const SENSITIVE_RE =
  /pass(word)?|passwd|pwd|card|cc[-_]?num|cvc|cvv|csc|credit|debit|iban|routing|ssn|social.?security|payment|expir/i;

const DESTRUCTIVE_RE =
  /submit|buy|purchase|checkout|pay|send|delete|remove|confirm order|place order/i;

export function isSensitiveFieldMeta(field: {
  type?: string;
  name?: string;
  label?: string;
}): boolean {
  const type = (field.type || "").toLowerCase();
  if (type === "password" || type === "hidden") return true;
  const blob = `${field.name || ""} ${field.label || ""}`;
  return SENSITIVE_RE.test(blob);
}

export function scrubSnapshot<T extends Record<string, unknown>>(snapshot: T): T {
  const clone = structuredClone(snapshot) as T & {
    forms?: Array<{ fields?: Array<Record<string, unknown>> }>;
  };
  if (Array.isArray(clone.forms)) {
    for (const form of clone.forms) {
      if (!Array.isArray(form.fields)) continue;
      form.fields = form.fields.filter((f) => !isSensitiveFieldMeta(f as never));
      for (const f of form.fields) {
        delete f.value;
      }
    }
  }
  return clone;
}

export function isDestructiveLabel(text: string): boolean {
  return DESTRUCTIVE_RE.test(text || "");
}
