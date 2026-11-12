import { tool } from "ai";
import { z } from "zod";
import { Firecrawl } from "firecrawl";

// The slice of the Firecrawl client these tools use. Injectable so the tool
// selection can be tested with canned results.
export type FirecrawlLike = Pick<Firecrawl, "search" | "scrape">;

const MAX_RESULT_CHARS = 6000;

const truncate = (value: unknown, max = MAX_RESULT_CHARS) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}... [truncated]` : text;
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const createFirecrawlTools = (getClient: () => FirecrawlLike) => ({
  findDataSources: tool({
    description:
      "Find structured live-data sources for a kind of real-world data (prices, availability, listings, filings, reviews, odds, rankings, official records, ...). " +
      "Describe the DATA you need in a short phrase, not the user's wording. Returns up to 5 candidate sources with their capability, cost, and the exact inputs each requires. " +
      "Call this once per question, then pick the best match and call getData.",
    inputSchema: z.object({
      need: z
        .string()
        .describe("Short description of the data needed, e.g. 'cheapest concert ticket price by day' or 'insider trades for a stock ticker'"),
    }),
    execute: async ({ need }) => {
      try {
        const result = await getClient().search(need, {
          sources: ["alexandria"],
          limit: 5,
          toolDetail: "full",
        });
        const tools = (result.tools ?? []).map((t) => ({
          provider: t.provider,
          capability: t.capability,
          description: t.description,
          credits: t.creditsCost,
          inputs: (t.options ?? []).map((o) => ({ name: o.name, type: o.type, required: o.required })),
          requiresOneOf: t.requiresOneOf,
        }));
        if (tools.length === 0) return { found: false, hint: "No structured source found. Try searchWeb." };
        return { found: true, tools };
      } catch (err) {
        return { found: false, error: errorMessage(err) };
      }
    },
  }),

  getData: tool({
    description:
      "Fetch live structured data from a source returned by findDataSources. Use the provider and capability exactly as given, and fill options only with the inputs that source lists. " +
      "Each call costs credits, so call it only when you can fill the required inputs, and at most 3 times per question.",
    inputSchema: z.object({
      provider: z.string(),
      capability: z.string(),
      // A JSON string rather than an object schema: record schemas emit JSON Schema
      // keywords some model providers (e.g. Gemini) reject.
      optionsJson: z
        .string()
        .describe('JSON object of inputs for the capability, using only input names listed by findDataSources, e.g. {"ticker":"TSLA"}'),
    }),
    execute: async ({ provider, capability, optionsJson }) => {
      try {
        let options: Record<string, unknown>;
        try {
          options = JSON.parse(optionsJson);
        } catch {
          return { ok: false, error: "optionsJson must be valid JSON" };
        }
        const res = await getClient().scrape({ alexandria: { provider, capability, options } });
        const item = res.alexandria[0];
        if (!item) return { ok: false, error: "No result returned" };
        if ("error" in item && item.error) return { ok: false, error: `${item.error.code}: ${item.error.message}` };
        return { ok: true, data: truncate(item.data) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  }),

  searchWeb: tool({
    description:
      "Search the web for current information when no structured source fits: recent news, how-tos, local info, reviews, anything that changes over time. Returns titles, URLs and snippets.",
    inputSchema: z.object({
      query: z.string().describe("A concise web search query"),
    }),
    execute: async ({ query }) => {
      try {
        const result = await getClient().search(query, { sources: ["web"], limit: 5 });
        const web = (result.web ?? []).map((r) => ({
          title: "title" in r ? r.title : undefined,
          url: "url" in r ? r.url : undefined,
          snippet: "description" in r ? r.description : undefined,
        }));
        return { results: web };
      } catch (err) {
        return { results: [], error: errorMessage(err) };
      }
    },
  }),

  readPage: tool({
    description:
      "Read the main content of one web page (a URL from searchWeb results, or one the user shared). Returns page text.",
    inputSchema: z.object({
      url: z.string().url(),
    }),
    execute: async ({ url }) => {
      try {
        const doc = await getClient().scrape(url, { formats: ["markdown"], onlyMainContent: true });
        return { ok: true, content: truncate(doc.markdown ?? "", 8000) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  }),
});

let client: Firecrawl | undefined;

// Real client, created lazily so a missing key only fails the tool call, not startup.
export const firecrawlTools = createFirecrawlTools(() => {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");
  client ??= new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  return client;
});
