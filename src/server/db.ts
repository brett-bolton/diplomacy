// Database connection. Production and local dev use Neon via node-postgres
// (pooled DATABASE_URL, Vercel Fluid pool handling). Tests inject PGlite.

import { attachDatabasePool } from "@vercel/functions"
import { drizzle } from "drizzle-orm/node-postgres"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import * as schema from "./schema"

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

let instance: Db | undefined

export function getDb(): Db {
  if (instance) return instance
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set. Run `neon env pull` or add it to .env.local.")
  const pool = new Pool({ connectionString: url, max: 5 })
  attachDatabasePool(pool)
  instance = drizzle(pool, { schema }) as unknown as Db
  return instance
}

/** Tests only: use an in-process database. */
export function setDbForTests(db: Db | undefined) {
  instance = db
}
