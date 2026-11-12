import { neon } from "@neon/ai-sdk-provider";

// Chosen by comparing tool-calling accuracy, latency and price across the gateway's models.
export const DEFAULT_AGENT_MODEL = "claude-haiku-5-5";

export const agentModel = () => neon(process.env.AI_MODEL ?? DEFAULT_AGENT_MODEL);
