import "./load-env";
import { runMigrations } from "../src/server/db/client";
import { env } from "../src/server/env";

async function main() {
  const url = env.databaseUrl;
  const label = url.startsWith("pglite:") ? url : url.replace(/\/\/[^@]*@/, "//***@");
  console.log(`Applying migrations to ${label} ...`);
  await runMigrations(url);
  console.log("Migrations applied.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
