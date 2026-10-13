import { copyReviewPrompt, chatPrompt, navigatePrompt } from "./prompts.js";
import type { PageSnapshot } from "../session.js";
import { isDestructiveLabel } from "../safety.js";

const apiKey = process.env.OPENAI_API_KEY || "";
const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function llmMode(): "openai" | "mock" {
  return apiKey ? "openai" : "mock";
}

async function chatCompletion(system: string, user: string): Promise<string> {
  if (!apiKey) throw new Error("no_api_key");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || "";
}

export type FeedbackItem = {
  kind: string;
  message: string;
  selector?: string;
  stub?: boolean;
};

function mockFeedback(snapshot: PageSnapshot): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const title = snapshot.title || "Untitled page";
  items.push({
    kind: "clarity",
    message: `Title “${title}” — ensure the H1 matches visitor intent within the first viewport.`,
    selector: snapshot.headings?.[0]?.selector || "",
  });

  const h1 = snapshot.headings?.find((h) => h.level === 1) || snapshot.headings?.[0];
  if (h1) {
    items.push({
      kind: "tone",
      message: `Heading “${h1.text}” reads ${h1.text.length > 70 ? "long — tighten for scanability" : "scannable — keep verbs concrete"}.`,
      selector: h1.selector,
    });
  }

  const cta =
    snapshot.buttons?.find((b) => /cart|buy|order|sign|get|start|contact|book/i.test(b.text)) ||
    snapshot.buttons?.[0];
  if (cta) {
    items.push({
      kind: "cta",
      message: `CTA “${cta.text || "(untitled)"}” — make the outcome explicit (what happens next).`,
      selector: cta.selector,
    });
  }

  const long = snapshot.textBlocks?.find((t) => t.text.length > 180);
  if (long) {
    items.push({
      kind: "grammar",
      message: `Dense paragraph near “${long.text.slice(0, 48)}…” — split into shorter lines; lead with the benefit.`,
      selector: long.selector,
    });
  } else if (snapshot.textBlocks?.[0]) {
    items.push({
      kind: "clarity",
      message: `Lead copy “${snapshot.textBlocks[0].text.slice(0, 64)}…” — keep the promise in the first 8 words.`,
      selector: snapshot.textBlocks[0].selector,
    });
  }

  if (snapshot.selection) {
    items.push({
      kind: "tone",
      message: `Selected text in focus: “${snapshot.selection.slice(0, 80)}” — check voice consistency with surrounding CTAs.`,
      selector: "",
    });
  }

  return items.slice(0, 5);
}

function parseJsonArray(text: string): FeedbackItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as FeedbackItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function generateCopyFeedback(snapshot: PageSnapshot): Promise<FeedbackItem[]> {
  if (!apiKey) return mockFeedback(snapshot);
  try {
    const raw = await chatCompletion(
      "You review marketing and UI copy. Reply with JSON only.",
      copyReviewPrompt(snapshot)
    );
    const parsed = parseJsonArray(raw);
    return parsed.length ? parsed : mockFeedback(snapshot);
  } catch {
    return mockFeedback(snapshot);
  }
}

export async function* streamChat(
  snapshot: PageSnapshot | null,
  message: string
): AsyncGenerator<string> {
  if (!apiKey) {
    const reply = mockChat(snapshot, message);
    for (const word of reply.split(/(\s+)/)) {
      yield word;
      await sleep(18);
    }
    return;
  }
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: "You are Live Page Co-Pilot. Be concise.",
          },
          { role: "user", content: chatPrompt(snapshot, message) },
        ],
      }),
    });
    if (!res.ok || !res.body) throw new Error("stream failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    const reply = mockChat(snapshot, message);
    for (const word of reply.split(/(\s+)/)) {
      yield word;
      await sleep(18);
    }
  }
}

function mockChat(snapshot: PageSnapshot | null, message: string): string {
  if (!snapshot) {
    return "I do not have a page snapshot yet. Open a tab and wait a moment, then ask again.";
  }
  const headings = snapshot.headings?.map((h) => h.text).filter(Boolean).slice(0, 6) || [];
  const buttons = snapshot.buttons?.map((b) => b.text).filter(Boolean).slice(0, 6) || [];
  return [
    `On “${snapshot.title}” (${snapshot.url}):`,
    headings.length ? `Headings: ${headings.join(" · ")}.` : "No headings captured.",
    buttons.length ? `Key actions: ${buttons.join(", ")}.` : "",
    `Re: “${message}” — use the Navigate box for scroll/click commands, or ask about a specific heading or CTA.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export type NavAction = {
  kind: "scroll" | "click" | "fill" | "submit";
  text?: string;
  selector?: string;
  value?: string;
  y?: number;
  requiresConfirm?: boolean;
};

export type NavPlan = {
  summary: string;
  actions: NavAction[];
};

export async function planNavigation(
  snapshot: PageSnapshot | null,
  command: string
): Promise<NavPlan> {
  if (apiKey && snapshot) {
    try {
      const raw = await chatCompletion(
        "You map UI commands to JSON actions only.",
        navigatePrompt(snapshot, command)
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as NavPlan;
        if (parsed?.actions?.length) {
          return decoratePlan(parsed, snapshot);
        }
      }
    } catch {
      /* fall through to heuristic */
    }
  }
  return heuristicNavigate(snapshot, command);
}

function decoratePlan(plan: NavPlan, snapshot: PageSnapshot): NavPlan {
  for (const action of plan.actions) {
    if (action.kind === "submit" || (action.text && isDestructiveLabel(action.text))) {
      action.requiresConfirm = true;
    }
    if (action.kind === "click" && action.text) {
      const btn = snapshot.buttons?.find((b) =>
        b.text.toLowerCase().includes(action.text!.toLowerCase())
      );
      if (btn?.destructive) action.requiresConfirm = true;
      if (btn && !action.selector) action.selector = btn.selector;
    }
  }
  return plan;
}

function heuristicNavigate(snapshot: PageSnapshot | null, command: string): NavPlan {
  const cmd = command.trim();
  const lower = cmd.toLowerCase();

  const scrollMatch = lower.match(/scroll\s+to\s+(.+)/i) || lower.match(/go\s+to\s+(.+)/i);
  if (scrollMatch) {
    const target = scrollMatch[1].replace(/['"]/g, "").trim();
    const heading = snapshot?.headings?.find((h) =>
      h.text.toLowerCase().includes(target.toLowerCase())
    );
    const link = snapshot?.links?.find((l) =>
      l.text.toLowerCase().includes(target.toLowerCase())
    );
    return {
      summary: `Scroll to “${target}”`,
      actions: [
        {
          kind: "scroll",
          text: target,
          selector: heading?.selector || link?.selector,
        },
      ],
    };
  }

  const clickMatch = lower.match(/click\s+(.+)/i) || lower.match(/press\s+(.+)/i);
  if (clickMatch) {
    const target = clickMatch[1].replace(/['"]/g, "").trim();
    const btn = snapshot?.buttons?.find((b) =>
      b.text.toLowerCase().includes(target.toLowerCase())
    );
    const link = snapshot?.links?.find((l) =>
      l.text.toLowerCase().includes(target.toLowerCase())
    );
    const label = btn?.text || link?.text || target;
    const requiresConfirm =
      !!btn?.destructive || isDestructiveLabel(label) || isDestructiveLabel(target);
    return {
      summary: `Click “${label}”`,
      actions: [
        {
          kind: "click",
          text: target,
          selector: btn?.selector || link?.selector,
          requiresConfirm,
        },
      ],
    };
  }

  const fillMatch = lower.match(/fill\s+(.+?)\s+with\s+(.+)/i);
  if (fillMatch) {
    return {
      summary: `Fill “${fillMatch[1]}”`,
      actions: [
        {
          kind: "fill",
          text: fillMatch[1].trim(),
          value: fillMatch[2].trim().replace(/^["']|["']$/g, ""),
        },
      ],
    };
  }

  // Default: treat as scroll target
  return {
    summary: `Try scrolling to “${cmd}”`,
    actions: [{ kind: "scroll", text: cmd }],
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
