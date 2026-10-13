import type { FastifyInstance } from "fastify";
import { generateCopyFeedback, llmMode } from "../llm/client.js";
import { getSession, type PageSnapshot } from "../session.js";
import { scrubSnapshot } from "../safety.js";

function sseWrite(
  reply: { raw: NodeJS.WritableStream },
  event: string,
  data: unknown
) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sessionId: string; mode?: string; snapshot?: PageSnapshot };
  }>("/api/feedback/stream", async (req, reply) => {
    const { sessionId, mode, snapshot: bodySnap } = req.body || ({} as never);
    if (!sessionId) {
      return reply.code(400).send({ error: "sessionId required" });
    }

    const session = getSession(sessionId);
    const snapshot = (bodySnap
      ? (scrubSnapshot(bodySnap) as PageSnapshot)
      : session.snapshot) as PageSnapshot | null;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    if (!snapshot) {
      sseWrite(reply, "status", { message: "No snapshot yet" });
      sseWrite(reply, "done", { ok: true });
      reply.raw.end();
      return;
    }

    const activeMode = mode || session.mode || "copy";
    if (activeMode !== "copy") {
      sseWrite(reply, "feedback", {
        kind: "stub",
        message: `${activeMode} mode is stubbed in MVP.`,
        stub: true,
      });
      sseWrite(reply, "done", { ok: true });
      reply.raw.end();
      return;
    }

    sseWrite(reply, "status", {
      message: `Copy review (${llmMode()})`,
    });

    try {
      const items = await generateCopyFeedback(snapshot);
      for (const item of items) {
        sseWrite(reply, "feedback", item);
        await new Promise((r) => setTimeout(r, 120));
      }
      sseWrite(reply, "done", { ok: true, count: items.length });
    } catch (err) {
      sseWrite(reply, "error", {
        message: err instanceof Error ? err.message : "feedback failed",
      });
    }
    reply.raw.end();
  });
}
