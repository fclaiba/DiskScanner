import { defineConfig } from "drizzle-kit";

// Migrations are generated from the schema with `npm run db:generate` and
// applied with `npm run db:migrate` (works for Postgres and PGlite).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
