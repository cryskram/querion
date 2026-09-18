import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * - `datasource.url` is used by migration/introspection commands. Point it at
 *   the Supabase session-mode pooler (DIRECT_URL, port 5432) — that connection
 *   can run DDL.
 * - The running app never uses this URL: it connects through the pg driver
 *   adapter with DATABASE_URL (transaction-mode pooler, port 6543).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
