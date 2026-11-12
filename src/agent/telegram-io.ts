import { downloadTelegramFile, sendTelegramChatAction, sendTelegramMessage, sendTelegramText } from "./telegram-api.js";

// Everything the agent needs from Telegram, behind an interface so tests can run without sending a real message.
export type TelegramIO = {
  sendText: (chatId: number, text: string) => Promise<void>;
  sendTyping: (chatId: number) => Promise<void>;
  sendWithButton: (chatId: number, text: string, button: { text: string; url: string }) => Promise<void>;
  downloadFile: (fileId: string) => Promise<Uint8Array>;
};

export const realTelegram: TelegramIO = {
  sendText: (chatId, text) => sendTelegramText(chatId, text),
  sendTyping: (chatId) => sendTelegramChatAction(chatId, "typing"),
  sendWithButton: async (chatId, text, button) => {
    await sendTelegramMessage(chatId, text, { button });
  },
  downloadFile: async (fileId) => (await downloadTelegramFile(fileId)).data,
};
