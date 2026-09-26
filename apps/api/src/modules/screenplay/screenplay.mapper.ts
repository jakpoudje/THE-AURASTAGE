// apps/api/src/modules/screenplay/screenplay.mapper.ts
// Maps persistence rows to @aurastage/contracts DTOs.
// Domain: Scriptwriter
// Canonical object: Script / Scene

import { SceneSchema, ScriptSchema, ScriptVersionSchema } from "@aurastage/contracts";

export const toScriptDTO = (row: unknown) => ScriptSchema.parse(row);
export const toScriptVersionDTO = (row: unknown) => ScriptVersionSchema.parse(row);
export const toSceneDTO = (row: unknown) => SceneSchema.parse(row);
