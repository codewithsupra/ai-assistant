// What a Telegram update looks like, and how a message with files is turned into text for the agent.
// Shared by the Hono gateway (in-process agent) and the dormant Trigger.dev channel.

export type TelegramFile = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };

export type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number; type?: string };
  from?: { id: number; is_bot?: boolean };
  document?: TelegramFile;
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
  video_note?: TelegramFile;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  /** Added by the Trigger.dev gateway path only. Never present on a raw Telegram update. */
  clerk_user_id?: string;
};

export type Attachment = { fileId: string; name: string; mediaType: string; size?: number };

// Every kind of file a user can upload, normalised.
export const attachmentsOf = (m: TelegramMessage): Attachment[] => {
  const list: Attachment[] = [];
  if (m.photo?.length) {
    const largest = m.photo[m.photo.length - 1]; // Telegram sends sizes ascending
    list.push({ fileId: largest.file_id, name: `photo-${m.message_id}.jpg`, mediaType: "image/jpeg", size: largest.file_size });
  }
  const add = (f: TelegramFile | undefined, fallbackName: string, fallbackType: string) => {
    if (f) list.push({ fileId: f.file_id, name: f.file_name ?? fallbackName, mediaType: f.mime_type ?? fallbackType, size: f.file_size });
  };
  add(m.document, `document-${m.message_id}`, "application/octet-stream");
  add(m.voice, `voice-${m.message_id}.ogg`, "audio/ogg");
  add(m.audio, `audio-${m.message_id}`, "audio/mpeg");
  add(m.video, `video-${m.message_id}.mp4`, "video/mp4");
  add(m.video_note, `video-note-${m.message_id}.mp4`, "video/mp4");
  return list;
};

// Images and PDFs can be read by the model directly; everything else goes through the sandbox.
const MODEL_READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
const MAX_MODEL_READABLE_BYTES = 8 * 1024 * 1024;

export const isModelReadable = (a: Attachment) => MODEL_READABLE.test(a.mediaType) && (a.size ?? 0) <= MAX_MODEL_READABLE_BYTES;

// The user's words plus one line per attachment. The line carries the file_id the agent needs to import
// a file into its sandbox, and it is what gets saved in the conversation history instead of file bytes.
export const describeMessage = (m: TelegramMessage) => {
  const attachments = attachmentsOf(m);
  const lines = attachments.map(
    (a) => `[Attached file: ${a.name} | ${a.mediaType}${a.size ? ` | ${a.size} bytes` : ""} | file_id: ${a.fileId}]`
  );
  const text = [m.text ?? m.caption ?? "", ...lines].filter(Boolean).join("\n");
  return { text, attachments };
};
