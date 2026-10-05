import { json } from "@/server/http";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ ok: true, version: pkg.version });
}
