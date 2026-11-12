import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// One pooled client per process (Trigger.dev workers load this module once and reuse it).
// Keep the pool small: each concurrently executing run holds up to `max` connections.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 3) });
pool.on("error", (err) => console.error("pg pool error", err));

export const db = drizzle({ client: pool, schema });
export * from "./schema.js";
