export const ENGINE_ID = "story.storyDevelopmentEngine";
/** 1.1.0: characters already decided are passed in and kept (names consistent across the production). */
export const ENGINE_VERSION = "1.1.0";
/** LLM-backed through the Provider Gateway (reasoning). The engine owns the prompt, schemas and the checks. */
export const ENGINE_KIND = "llm" as const;
