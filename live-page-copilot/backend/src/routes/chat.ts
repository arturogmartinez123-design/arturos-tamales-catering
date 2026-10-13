import type { FastifyInstance } from "fastify";
import { streamChat } from "../llm/client.js";
import { getSession, type PageSnapshot } from "../session.js";
import { scrubSnapshot } from "../safety.js";

export async function chatRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sessionId: string; message: string; snapshot?: PageSnapshot };
  }>("/api/chat", async (req, reply) => {
    const { sessionId, message, snapshot: bodySnap } = req.body || ({} as never);
    if (!sessionId || !message) {
      return reply.code(400).send({ error: "sessionId and message required" });
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

    let full = "";
    try {
      for await (const token of streamChat(snapshot, message)) {
        full += token;
        reply.raw.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      }
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ message: full })}\n\n`);
    } catch (err) {
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({
          message: err instanceof Error ? err.message : "chat failed",
        })}\n\n`
      );
    }
    reply.raw.end();
  });
}
