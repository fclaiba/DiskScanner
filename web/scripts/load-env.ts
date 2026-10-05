// Loads .env* files the same way Next.js does, for standalone scripts.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
