import { task, logger, wait } from "@trigger.dev/sdk";

export const helloWorldTask = task({
  id: "hello-world",
  run: async (payload: { name?: string }) => {
    logger.log("Hello from Trigger.dev", { payload });

    await wait.for({ seconds: 2 });

    return { message: `Hello, ${payload.name ?? "world"}!` };
  },
});
