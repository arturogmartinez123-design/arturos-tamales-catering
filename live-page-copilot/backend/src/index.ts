import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { snapshotRoutes } from "./routes/snapshot.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { chatRoutes } from "./routes/chat.js";
import { navigateRoutes } from "./routes/navigate.js";
import { llmMode } from "./llm/client.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
});

app.get("/health", async () => ({
  ok: true,
  llm: llmMode(),
  time: new Date().toISOString(),
}));

await snapshotRoutes(app);
await feedbackRoutes(app);
await chatRoutes(app);
await navigateRoutes(app);

try {
  await app.listen({ port, host });
  app.log.info(`Live Page Co-Pilot backend on http://${host}:${port} (llm=${llmMode()})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
