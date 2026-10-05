// Minimal structured JSON logger. Never pass secrets, tokens, passwords or
// email addresses in `fields`; user ids are fine.

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const REDACT = /pass(word)?|secret|token|authorization|cookie|signature|email|key/i;

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info")) as Level;
  return ORDER[lvl] ?? ORDER.info;
}

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k) && k !== "keyId") {
      out[k] = "[redacted]";
    } else if (v instanceof Error) {
      out[k] = { name: v.name, message: v.message };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitize(fields) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/** Request id from the platform (Vercel) or a fresh one. */
export function requestId(headers: Headers): string {
  return headers.get("x-vercel-id") ?? headers.get("x-request-id") ?? crypto.randomUUID();
}
