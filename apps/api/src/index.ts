// apps/api/src/index.ts
// Composition root only: wiring (CORS, auth hook, route registration).
// No business logic lives here — see CLAUDE.md rule 1 (identify canonical
// domain authority before editing) and module READMEs for where things live.

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAuth } from "./infrastructure/auth";
import { registerProtection } from "./infrastructure/rateLimit";
import { registerProjectsRoutes } from "./modules/projects/projects.controller";
import { registerCollaborationRoutes } from "./modules/collaboration/collaboration.controller";
import { registerScreenplayRoutes } from "./modules/screenplay/screenplay.controller";
import { registerCharactersRoutes } from "./modules/characters/characters.controller";
import { registerDialogueRoutes } from "./modules/dialogue/dialogue.controller";
import { registerSceneDnaRoutes } from "./modules/scene-dna/sceneDna.controller";
import { registerShotsRoutes } from "./modules/shots/shots.controller";
import { registerGenerationRoutes } from "./modules/generation/generation.controller";
import { registerAssetsRoutes } from "./modules/assets/assets.controller";
import { registerAudioRoutes } from "./modules/audio/audio.controller";
import { registerEditorialRoutes } from "./modules/editorial/editorial.controller";
import { registerRenderingRoutes } from "./modules/rendering/rendering.controller";
import { registerHelpRoutes } from "./modules/help/help.controller";
import { registerSettingsRoutes } from "./modules/settings/settings.controller";
import { registerAssistantRoutes } from "./modules/assistant/assistant.controller";
import { registerWorldRoutes } from "./modules/world/world.controller";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN?.split(",") ?? true,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "aurastage-api",
    phase: 11,
    timestamp: new Date().toISOString(),
  }));

  await registerAuth(app);
  await registerProtection(app);
  await registerProjectsRoutes(app);
  await registerCollaborationRoutes(app);
  await registerScreenplayRoutes(app);
  await registerCharactersRoutes(app);
  await registerDialogueRoutes(app);
  await registerSceneDnaRoutes(app);
  await registerShotsRoutes(app);
  await registerGenerationRoutes(app);
  await registerAssetsRoutes(app);
  await registerAudioRoutes(app);
  await registerEditorialRoutes(app);
  await registerRenderingRoutes(app);
  await registerHelpRoutes(app);
  await registerSettingsRoutes(app);
  await registerAssistantRoutes(app);
  await registerWorldRoutes(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
