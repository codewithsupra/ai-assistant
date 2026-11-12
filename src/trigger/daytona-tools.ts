import { tool } from "ai";
import { z } from "zod";
import { Daytona, DaytonaNotFoundError, type Sandbox } from "@daytona/sdk";
import { parseSessionId, sandboxNameFor } from "./session-id.js";
import { downloadTelegramFile, sendTelegramFile, TELEGRAM_MAX_DOWNLOAD_BYTES } from "./telegram-api.js";

const MAX_OUTPUT_CHARS = 6000;
const HOME = "/home/daytona";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const truncate = (text: string, max = MAX_OUTPUT_CHARS) =>
  text.length > max ? `${text.slice(0, max)}... [truncated]` : text;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

// "../x" or absolute paths outside the home folder are not needed for chat tasks.
const toSandboxPath = (path: string) => {
  const resolved = path.startsWith("/") ? path : `${HOME}/${path}`;
  if (resolved.split("/").includes("..")) throw new Error("Paths may not contain '..'");
  return resolved;
};

const safeFilename = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";

let daytona: Daytona | undefined;
const getDaytona = () => {
  if (!process.env.DAYTONA_API_KEY) throw new Error("DAYTONA_API_KEY is not configured");
  daytona ??= new Daytona();
  return daytona;
};

// One persistent sandbox per Clerk user, found by a name derived from the Clerk user id, so no database is needed.
// Its files survive between messages; it auto-stops when idle and is restarted on demand.
const ensureSandbox = async (clerkUserId: string): Promise<Sandbox> => {
  const client = getDaytona();
  const name = sandboxNameFor(clerkUserId);
  let sandbox: Sandbox;
  try {
    sandbox = await client.get(name);
  } catch (err) {
    if (!(err instanceof DaytonaNotFoundError)) throw err;
    sandbox = await client.create({
      name,
      labels: { app: "telegram-agent", clerkUserId },
      autoStopInterval: 15,
    });
  }
  if (sandbox.state !== "started") await sandbox.start();
  return sandbox;
};

export const createDaytonaTools = (sessionChatId: string) => {
  // Throws unless the session belongs to a linked Clerk user in a private Telegram chat.
  const { clerkUserId, telegramChatId } = parseSessionId(sessionChatId);

  // Resolved lazily and once per turn, so users who never need a sandbox never create one.
  let sandboxPromise: Promise<Sandbox> | undefined;
  const sandbox = () => (sandboxPromise ??= ensureSandbox(clerkUserId));

  let desktopStarted = false;
  const desktop = async () => {
    const sb = await sandbox();
    if (!desktopStarted) {
      await sb.computerUse.start();
      await new Promise((resolve) => setTimeout(resolve, 3000)); // let the desktop come up
      desktopStarted = true;
    }
    return sb;
  };

  const screenshot = async () => {
    const sb = await desktop();
    const shot = await sb.computerUse.screenshot.takeCompressed({ format: "jpeg", quality: 60 });
    if (!shot.screenshot) throw new Error("The desktop returned an empty screenshot");
    return shot.screenshot;
  };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

  return {
    runCommand: tool({
      description:
        "Run a shell command in the user's private Linux sandbox (Debian, Python 3 with pandas/numpy/matplotlib/pillow/pypdf, Node.js, Chromium, pip and apt available). " +
        "Use it to process files, convert formats, run code, install packages (pip install ...), and generate files. The working directory is /home/daytona and it persists between messages. " +
        "For long jobs raise timeoutSeconds. Returns the exit code and the output.",
      inputSchema: z.object({
        command: z.string().describe("Shell command to run, e.g. 'python3 script.py' or 'pip install openpyxl'"),
        cwd: z.string().optional().describe("Working directory, default /home/daytona"),
        timeoutSeconds: z.number().int().min(1).max(300).optional().describe("Default 60"),
      }),
      execute: async ({ command, cwd, timeoutSeconds }) => {
        try {
          const sb = await sandbox();
          const res = await sb.process.executeCommand(command, cwd ? toSandboxPath(cwd) : undefined, undefined, timeoutSeconds ?? 60);
          return { exitCode: res.exitCode, output: truncate(res.result) };
        } catch (err) {
          return { exitCode: -1, output: errorMessage(err) };
        }
      },
    }),

    writeFile: tool({
      description: "Write a text file in the sandbox (scripts, CSV, JSON, Markdown, HTML, ...). Creates parent folders.",
      inputSchema: z.object({
        path: z.string().describe("Path relative to /home/daytona, e.g. 'work/script.py'"),
        content: z.string(),
      }),
      execute: async ({ path, content }) => {
        try {
          const sb = await sandbox();
          const full = toSandboxPath(path);
          await sb.process.executeCommand(`mkdir -p "$(dirname '${full.replace(/'/g, "'\\''")}')"`);
          await sb.fs.uploadFile(Buffer.from(content, "utf8"), full);
          return { ok: true, path: full, bytes: Buffer.byteLength(content) };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    readFile: tool({
      description: "Read a text file from the sandbox. Large files are truncated; use runCommand (head, python) to inspect big or binary files.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        try {
          const sb = await sandbox();
          const data = await sb.fs.downloadFile(toSandboxPath(path));
          return { ok: true, content: truncate(data.toString("utf8")) };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    listFiles: tool({
      description: "List files and folders in a sandbox directory.",
      inputSchema: z.object({ path: z.string().optional().describe("Default /home/daytona") }),
      execute: async ({ path }) => {
        try {
          const sb = await sandbox();
          const files = await sb.fs.listFiles(path ? toSandboxPath(path) : HOME);
          return { ok: true, files: files.map((f) => ({ name: f.name, dir: f.isDir, bytes: f.size })) };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    importUserFile: tool({
      description:
        "Copy a file the user attached in Telegram into the sandbox so it can be processed. Use the file_id shown in the '[Attached file ...]' line of the user's message. " +
        "The file is saved under /home/daytona/inbox/. Files over 20 MB cannot be fetched.",
      inputSchema: z.object({
        fileId: z.string().describe("The file_id from the attachment line"),
        filename: z.string().describe("Name to save it as, usually the original file name"),
      }),
      execute: async ({ fileId, filename }) => {
        try {
          const { data } = await downloadTelegramFile(fileId);
          if (data.byteLength > TELEGRAM_MAX_DOWNLOAD_BYTES) throw new Error("File is larger than 20 MB");
          const sb = await sandbox();
          const full = `${HOME}/inbox/${safeFilename(filename)}`;
          await sb.process.executeCommand(`mkdir -p ${HOME}/inbox`);
          await sb.fs.uploadFile(Buffer.from(data), full);
          return { ok: true, path: full, bytes: data.byteLength };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    sendFileToUser: tool({
      description:
        "Send a file from the sandbox to the user in Telegram (documents, spreadsheets, PDFs, images, archives, ...). Images are sent as photos. Max 50 MB. " +
        "Call it once the file exists and you have checked it, then tell the user what you sent.",
      inputSchema: z.object({
        path: z.string().describe("File path in the sandbox"),
        caption: z.string().optional().describe("Short caption shown with the file"),
      }),
      execute: async ({ path, caption }) => {
        try {
          const sb = await sandbox();
          const full = toSandboxPath(path);
          const data = await sb.fs.downloadFile(full);
          const filename = full.split("/").pop() ?? "file";
          const ext = filename.split(".").pop()?.toLowerCase() ?? "";
          const sent = await sendTelegramFile(telegramChatId, {
            data: new Uint8Array(data),
            filename,
            caption,
            asPhoto: IMAGE_EXTENSIONS.has(ext),
          });
          return { ok: true, filename, bytes: data.byteLength, ...sent };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    // ---- Computer use: a real Linux desktop the agent can see and operate ----

    desktopScreenshot: tool({
      description:
        "Take a screenshot of the sandbox's Linux desktop and look at it. Starts the desktop on first use. " +
        "Use it to see what is on screen before and after every desktop action. Coordinates for desktopClick/desktopScroll are pixels in this image. " +
        "To open a web page in a browser, first run: runCommand with \"DISPLAY=:0 nohup chromium --no-sandbox --start-maximized 'URL' >/dev/null 2>&1 &\" and wait a few seconds.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return { ok: true as const, image: await screenshot() };
        } catch (err) {
          return { ok: false as const, error: errorMessage(err) };
        }
      },
      toModelOutput: ({ output }) =>
        output.ok
          ? {
              type: "content",
              value: [{ type: "file", mediaType: "image/jpeg", data: { type: "data", data: output.image } }],
            }
          : { type: "text", value: `Screenshot failed: ${output.error}` },
    }),

    desktopClick: tool({
      description: "Click (or double-click / right-click) at pixel coordinates on the desktop, then returns. Take a screenshot afterwards to see the result.",
      inputSchema: z.object({
        x: z.number().int(),
        y: z.number().int(),
        button: z.enum(["left", "right", "middle"]).optional(),
        double: z.boolean().optional(),
      }),
      execute: async ({ x, y, button, double }) => {
        try {
          const sb = await desktop();
          await sb.computerUse.mouse.click(x, y, button ?? "left", double ?? false);
          await settle();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    desktopType: tool({
      description: "Type text on the desktop into whatever is focused (click a text field first). Newlines press Enter.",
      inputSchema: z.object({ text: z.string().max(2000) }),
      execute: async ({ text }) => {
        try {
          const sb = await desktop();
          await sb.computerUse.keyboard.type(text);
          await settle();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    desktopKey: tool({
      description: "Press a key or key combination on the desktop, e.g. 'enter', 'tab', 'escape', 'ctrl+l', 'ctrl+a', 'alt+tab'.",
      inputSchema: z.object({ keys: z.string().describe("A key name or combination joined with '+'") }),
      execute: async ({ keys }) => {
        try {
          const sb = await desktop();
          if (keys.includes("+")) await sb.computerUse.keyboard.hotkey(keys);
          else await sb.computerUse.keyboard.press(keys);
          await settle();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    desktopScroll: tool({
      description: "Scroll the mouse wheel at pixel coordinates on the desktop.",
      inputSchema: z.object({
        x: z.number().int(),
        y: z.number().int(),
        direction: z.enum(["up", "down"]),
        amount: z.number().int().min(1).max(20).optional().describe("Wheel ticks, default 3"),
      }),
      execute: async ({ x, y, direction, amount }) => {
        try {
          const sb = await desktop();
          await sb.computerUse.mouse.scroll(x, y, direction, amount ?? 3);
          await settle();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),

    sendScreenshotToUser: tool({
      description: "Take a fresh screenshot of the desktop and send it to the user in Telegram as a photo.",
      inputSchema: z.object({ caption: z.string().optional() }),
      execute: async ({ caption }) => {
        try {
          const image = await screenshot();
          await sendTelegramFile(telegramChatId, {
            data: new Uint8Array(Buffer.from(image, "base64")),
            filename: "screenshot.jpg",
            caption,
            asPhoto: true,
          });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
    }),
  };
};
