// Thin Telegram Bot API helpers shared by the channel (text replies, inbound
// file downloads) and the agent's file tools (sending files back).

const TELEGRAM_MAX_LENGTH = 4096;
// Cloud Bot API limits: bots can download files up to 20 MB, upload documents up to 50 MB and photos up to 10 MB.
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
export const TELEGRAM_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const TELEGRAM_MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const token = () => {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return value;
};

const apiUrl = (method: string) => `https://api.telegram.org/bot${token()}/${method}`;

const assertOk = async (res: Response, what: string) => {
  if (res.ok) return res;
  throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
};

export const sendTelegramMessage = async (
  chatId: number,
  text: string,
  options?: { button?: { text: string; url: string } }
) => {
  const res = await assertOk(
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, TELEGRAM_MAX_LENGTH),
        ...(options?.button
          ? { reply_markup: { inline_keyboard: [[{ text: options.button.text, url: options.button.url }]] } }
          : {}),
      }),
    }),
    "Telegram sendMessage"
  );
  const body = (await res.json()) as { result?: { message_id: number } };
  return { ref: String(body.result?.message_id ?? "") };
};

// Download a file the user uploaded, by its Telegram file_id.
export const downloadTelegramFile = async (fileId: string) => {
  const info = await fetch(apiUrl("getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const parsed = (await info.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string; file_size?: number };
  };
  if (!parsed.ok || !parsed.result?.file_path) {
    const reason = parsed.description ?? "unknown error";
    throw new Error(
      /too big/i.test(reason)
        ? "That file is larger than 20 MB, which is the most the bot can download from Telegram."
        : `Telegram could not provide the file: ${reason}`
    );
  }
  const file = await assertOk(
    await fetch(`https://api.telegram.org/file/bot${token()}/${parsed.result.file_path}`),
    "Telegram file download"
  );
  return { data: new Uint8Array(await file.arrayBuffer()), filePath: parsed.result.file_path };
};

// Send a file back to the user as a document, or as a photo when it is a small image.
export const sendTelegramFile = async (
  chatId: number,
  file: { data: Uint8Array; filename: string; caption?: string; asPhoto?: boolean }
) => {
  if (file.data.byteLength > TELEGRAM_MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 50 MB, which is the most the bot can send through Telegram.");
  }
  const asPhoto = !!file.asPhoto && file.data.byteLength <= TELEGRAM_MAX_PHOTO_BYTES;
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (file.caption) form.set("caption", file.caption.slice(0, 1024));
  form.set(asPhoto ? "photo" : "document", new Blob([file.data as BlobPart]), file.filename);
  await assertOk(
    await fetch(apiUrl(asPhoto ? "sendPhoto" : "sendDocument"), { method: "POST", body: form }),
    asPhoto ? "Telegram sendPhoto" : "Telegram sendDocument"
  );
  return { sentAs: asPhoto ? "photo" : "document" };
};
