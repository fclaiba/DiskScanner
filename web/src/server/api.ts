import type { NextResponse } from "next/server";
import { apiError } from "./http";
import { log, requestId } from "./log";

type Handler<C> = (req: Request, ctx: C) => Promise<NextResponse | Response>;

/**
 * Wraps a /api/v1 handler: unexpected errors become the contract's error
 * format (500 internal_error) and are logged with a request id.
 */
export function withApi<C = unknown>(name: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const rid = requestId(req.headers);
    try {
      return await handler(req, ctx);
    } catch (err) {
      log.error("unhandled api error", { route: name, requestId: rid, err });
      return apiError(500, "internal_error", "Something went wrong on our side. Try again shortly.", { "X-Request-Id": rid });
    }
  };
}
