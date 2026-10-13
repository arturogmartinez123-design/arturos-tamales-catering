import { compactSnapshot, type PageSnapshot } from "../session.js";

export function copyReviewPrompt(snapshot: PageSnapshot): string {
  const compact = compactSnapshot(snapshot);
  return `You are a sharp copy editor reviewing a live web page snapshot.
Focus on clarity, tone, grammar, and CTA strength.
Return ONLY a JSON array (no markdown) of 3 to 6 objects:
[{"kind":"clarity"|"tone"|"grammar"|"cta","message":"...","selector":"CSS selector from snapshot or empty string"}]
Prefer real selectors from the snapshot when referencing a specific element.
Page snapshot:
${JSON.stringify(compact, null, 2)}`;
}

export function chatPrompt(snapshot: PageSnapshot | null, message: string): string {
  const page = snapshot ? JSON.stringify(compactSnapshot(snapshot), null, 2) : "(no snapshot yet)";
  return `You are Live Page Co-Pilot. Answer questions about the page the user is viewing.
Be concise and practical. Reference headings/buttons/links when useful.
Page snapshot:
${page}

User question: ${message}`;
}

export function navigatePrompt(snapshot: PageSnapshot | null, command: string): string {
  const page = snapshot ? JSON.stringify(compactSnapshot(snapshot), null, 2) : "{}";
  return `Map this natural language command to page actions.
Return ONLY JSON: {"summary":"...","actions":[{"kind":"scroll"|"click"|"fill"|"submit","text":"optional visible text","selector":"optional css","value":"for fill","y":number,"requiresConfirm":boolean}]}
Rules:
- Prefer selectors from the snapshot when possible.
- Set requiresConfirm true for submit/buy/send/delete/checkout/pay.
- For "scroll to X", use kind scroll with text matching a heading or landmark.
- For "click X", use kind click with text or selector.
Command: ${command}
Snapshot:
${page}`;
}
