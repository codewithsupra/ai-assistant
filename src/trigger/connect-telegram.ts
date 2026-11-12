import { logger, task, wait } from "@trigger.dev/sdk";
import { findClerkUserId, linkTelegramUser } from "../db/identities.js";
import {
  clerkOAuthConfigFromEnv,
  fetchClerkUserId,
  pollDeviceToken,
  startDeviceAuthorization,
} from "./clerk-device-flow.js";
import { sendTelegramMessage } from "./telegram-api.js";

export type ConnectTelegramPayload = {
  /** Telegram user id of the stranger (the same as the chat id in a private chat). */
  telegramUserId: string;
  chatId: number;
};

// Links a Telegram user to a Clerk user with Clerk's device authorization flow:
// send a link and short code, wait for the person to approve it, then save the pairing.
export const connectTelegramAccount = task({
  id: "connect-telegram-account",
  maxDuration: 900,
  // A retry would send the person a second code while the first is still valid.
  retry: { maxAttempts: 1 },
  // Strangers can start these; keep a ceiling on how many wait at once.
  queue: { concurrencyLimit: 20 },
  run: async (payload: ConnectTelegramPayload) => {
    const { telegramUserId, chatId } = payload;

    // Already connected (for example by an earlier run): nothing to do.
    if (await findClerkUserId(telegramUserId)) return { status: "already_linked" as const };

    const clerk = clerkOAuthConfigFromEnv();
    const auth = await startDeviceAuthorization(clerk);

    await sendTelegramMessage(
      chatId,
      [
        "Hi! Before we chat, connect your account.",
        "",
        `1. Open ${auth.verificationUriComplete}`,
        "2. Sign in with Google",
        `3. Check that the code shows ${auth.userCode}, then approve`,
        "",
        `Code: ${auth.userCode} (valid for ${Math.round(auth.expiresIn / 60)} minutes)`,
        "",
        "Only approve this if you just asked for it, and never share this link or code with anyone.",
        "When it says you're connected, send me your message again.",
      ].join("\n"),
      { button: { text: "Connect your account", url: auth.verificationUriComplete } }
    );

    const deadline = Date.now() + auth.expiresIn * 1000;
    let interval = Math.max(auth.interval, 5);

    while (Date.now() < deadline) {
      await wait.for({ seconds: interval });
      const poll = await pollDeviceToken(clerk, auth.deviceCode);

      if (poll.status === "pending") continue;
      if (poll.status === "slow_down") {
        interval += 5;
        continue;
      }
      if (poll.status === "denied") {
        await sendTelegramMessage(chatId, "No problem, the connection was cancelled. Message me again whenever you want to try again.");
        return { status: "denied" as const };
      }
      if (poll.status === "expired") break;

      // Approved: find out who approved it, then save the pairing.
      const clerkUserId = await fetchClerkUserId(clerk, poll.accessToken);
      const result = await linkTelegramUser(telegramUserId, clerkUserId);
      logger.log("Telegram account link finished", { result });

      if (result === "conflict") {
        await sendTelegramMessage(chatId, "This Telegram account is already connected to a different account, so I could not connect it again.");
        return { status: "conflict" as const };
      }
      await sendTelegramMessage(chatId, "You're connected! Send me a message to get started.");
      return { status: result };
    }

    await sendTelegramMessage(chatId, "That link expired before it was approved. Send me a message to get a new one.");
    return { status: "expired" as const };
  },
});
