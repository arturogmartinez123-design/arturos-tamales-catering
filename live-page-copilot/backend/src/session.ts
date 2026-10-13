export type PageSnapshot = {
  url: string;
  title: string;
  capturedAt: number;
  scroll?: { x: number; y: number; maxY: number };
  selection?: string;
  hover?: string;
  headings: Array<{ id: string; level: number; text: string; selector: string }>;
  textBlocks: Array<{ id: string; text: string; selector: string }>;
  links: Array<{ id: string; text: string; href: string; selector: string }>;
  buttons: Array<{
    id: string;
    text: string;
    selector: string;
    role?: string;
    destructive?: boolean;
  }>;
  forms: Array<{
    id: string;
    selector: string;
    fields: Array<{ name: string; type: string; label: string; selector: string }>;
  }>;
  images: Array<{ id: string; alt: string; selector: string }>;
};

type SessionState = {
  snapshot: PageSnapshot | null;
  mode: string;
  updatedAt: number;
  lastHash: string;
};

const sessions = new Map<string, SessionState>();

function hashSnapshot(snapshot: PageSnapshot): string {
  const key = JSON.stringify({
    url: snapshot.url,
    title: snapshot.title,
    headings: snapshot.headings?.map((h) => h.text),
    text: snapshot.textBlocks?.slice(0, 8).map((t) => t.text),
    buttons: snapshot.buttons?.map((b) => b.text),
    selection: snapshot.selection,
    scrollY: snapshot.scroll?.y,
  });
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return String(h);
}

export function getSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { snapshot: null, mode: "copy", updatedAt: 0, lastHash: "" };
    sessions.set(sessionId, s);
  }
  return s;
}

export function saveSnapshot(
  sessionId: string,
  snapshot: PageSnapshot,
  mode?: string
): { changed: boolean; session: SessionState } {
  const session = getSession(sessionId);
  const nextHash = hashSnapshot(snapshot);
  const changed = nextHash !== session.lastHash;
  session.snapshot = snapshot;
  session.lastHash = nextHash;
  session.updatedAt = Date.now();
  if (mode) session.mode = mode;
  return { changed, session };
}

export function compactSnapshot(snapshot: PageSnapshot) {
  return {
    url: snapshot.url,
    title: snapshot.title,
    scroll: snapshot.scroll,
    selection: snapshot.selection,
    hover: snapshot.hover,
    headings: snapshot.headings?.slice(0, 20),
    textBlocks: snapshot.textBlocks?.slice(0, 15),
    links: snapshot.links?.slice(0, 20),
    buttons: snapshot.buttons?.slice(0, 20),
    forms: snapshot.forms?.slice(0, 5),
    images: snapshot.images?.slice(0, 10),
  };
}
