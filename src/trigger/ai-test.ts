import { task, logger } from "@trigger.dev/sdk";
import { generateText } from "ai";
import { neon } from "@neon/ai-sdk-provider";

// TEMPORARY: backs the public GET /test/ai route. Remove together with it.
export const aiTestTask = task({
  id: "ai-test-generate-text",
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  run: async (payload: { prompt: string }) => {
    logger.log("Generating text", { promptLength: payload.prompt.length });

    const { text, usage } = await generateText({
      model: neon(process.env.AI_MODEL ?? "gemini-3-5-flash-lite"),
      instructions: "You are a helpful assistant. Keep answers short.",
      prompt: payload.prompt,
      maxOutputTokens: 300,
    });

    return { text: text.trim(), usage };
  },
});
