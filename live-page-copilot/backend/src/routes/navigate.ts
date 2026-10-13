import type { FastifyInstance } from "fastify";
import { planNavigation } from "../llm/client.js";
import { getSession, type PageSnapshot } from "../session.js";
import { scrubSnapshot } from "../safety.js";

export async function navigateRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sessionId: string; command: string; snapshot?: PageSnapshot };
  }>("/api/navigate", async (req, reply) => {
    const { sessionId, command, snapshot: bodySnap } = req.body || ({} as never);
    if (!sessionId || !command) {
      return reply.code(400).send({ error: "sessionId and command required" });
    }
    const session = getSession(sessionId);
    const snapshot = (bodySnap
      ? (scrubSnapshot(bodySnap) as PageSnapshot)
      : session.snapshot) as PageSnapshot | null;

    const plan = await planNavigation(snapshot, command);
    return plan;
  });
}
