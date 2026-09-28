// Ask AuraStage errors. Every one carries an AURA-AI code and the HTTP status the controller sends.
export class AssistantError extends Error {
  constructor(public status: number, public code: string, message: string, public issues?: unknown) {
    super(message);
  }
}
export const notFound = (msg = "That request wasn't found") => new AssistantError(404, "AURA-AI-404", msg);
