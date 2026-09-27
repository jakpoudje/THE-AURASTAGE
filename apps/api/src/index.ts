// apps/api/src/index.ts
// Composition root only: wiring (CORS, auth hook, route registration).
// No business logic lives here — see CLAUDE.md rule 1 (identify canonical
// domain authority before editing) and module READMEs for where things live.

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAuth } from "./infrastructure/auth";
import { registerProjectsRoutes } from "./modules/projects/projects.controller";
import { registerCollaborationRoutes } from "./modules/collaboration/collaboration.controller";
import { registerScreenplayRoutes } from "./modules/screenplay/screenplay.controller";
import { registerCharactersRoutes } from "./modules/characters/characters.controller";
import { registerDialogueRoutes } from "./modules/dialogue/dialogue.controller";
import { registerSceneDnaRoutes } from "./modules/scene-dna/sceneDna.controller";
import { registerShotsRoutes } from "./modules/shots/shots.controller";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN?.split(",") ?? true,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "aurastage-api",
    phase: 6,
    timestamp: new Date().toISOString(),
  }));

  await registerAuth(app);
  await registerProjectsRoutes(app);
  await registerCollaborationRoutes(app);
  await registerScreenplayRoutes(app);
  await registerCharactersRoutes(app);
  await registerDialogueRoutes(app);
  await registerSceneDnaRoutes(app);
  await registerShotsRoutes(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
