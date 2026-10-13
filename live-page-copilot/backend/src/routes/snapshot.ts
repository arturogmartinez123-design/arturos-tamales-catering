import type { FastifyInstance } from "fastify";
import { scrubSnapshot } from "../safety.js";
import { saveSnapshot, type PageSnapshot } from "../session.js";

export async function snapshotRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sessionId: string; mode?: string; snapshot: PageSnapshot };
  }>("/api/snapshot", async (req, reply) => {
    const { sessionId, mode, snapshot } = req.body || ({} as never);
    if (!sessionId || !snapshot) {
      return reply.code(400).send({ error: "sessionId and snapshot required" });
    }
    const clean = scrubSnapshot(snapshot) as PageSnapshot;
    const { changed } = saveSnapshot(sessionId, clean, mode);
    return { ok: true, changed, capturedAt: clean.capturedAt };
  });
}
