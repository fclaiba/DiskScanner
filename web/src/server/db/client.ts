import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";
import { log } from "../log";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbHolder {
  db: DB;
  close: () => Promise<void>;
}

// Kept on globalThis so dev HMR / separate route bundles share one connection
// (essential for the in-memory PGlite database).
const g = globalThis as unknown as { __dsDb?: Promise<DbHolder> };

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function isPglite(url: string): boolean {
  return url.startsWith("pglite:");
}

/** `pglite://memory` → in-memory; `pglite:./.data/dev` → directory. */
export function pgliteDataDir(url: string): string | undefined {
  const rest = url.slice("pglite:".length);
  if (rest === "//memory" || rest === "memory" || rest === "") return undefined;
  return rest.replace(/^\/\//, "");
}

async function create(url: string, autoMigrate: boolean): Promise<DbHolder> {
  if (isPglite(url)) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = pgliteDataDir(url);
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await client.waitReady;
    const db = drizzle({ client, schema }) as unknown as DB;
    if (autoMigrate) {
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      await migrate(drizzle({ client, schema }), { migrationsFolder: MIGRATIONS_FOLDER });
      log.debug("pglite migrations applied", { dir: dir ?? "memory" });
    }
    return { db, close: () => client.close() };
  }
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // prepare:false keeps us compatible with transaction-mode poolers (Neon, PgBouncer).
  const client = postgres(url, { prepare: false, max: env.isProd ? 5 : 10 });
  const db = drizzle({ client, schema }) as unknown as DB;
  return { db, close: () => client.end() };
}

export function getDb(): Promise<DB> {
  if (!g.__dsDb) {
    const url = env.databaseUrl;
    g.__dsDb = create(url, isPglite(url)).catch((err) => {
      g.__dsDb = undefined;
      throw err;
    });
  }
  return g.__dsDb.then((h) => h.db);
}

/** Test helper: drop the cached connection (closing it). */
export async function closeDb(): Promise<void> {
  const holder = g.__dsDb;
  g.__dsDb = undefined;
  if (holder) await (await holder).close();
}

/** Used by scripts/migrate.ts for both drivers. */
export async function runMigrations(url: string): Promise<void> {
  if (isPglite(url)) {
    const h = await create(url, true);
    await h.close();
    return;
  }
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

export { schema };
