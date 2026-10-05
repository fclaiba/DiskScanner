import { getDb } from "./db/client";
import { auditLog } from "./db/schema";
import { log } from "./log";

export type AuditAction =
  | "auth.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_change"
  | "auth.password_reset"
  | "auth.email_verified"
  | "device.approve"
  | "device.deny"
  | "device.revoke"
  | "device.self_revoke"
  | "subscription.change"
  | "account.delete";

/** Writes an audit entry. Never throws (auditing must not break the action). */
export async function audit(
  action: AuditAction,
  userId: string | null,
  meta: Record<string, unknown> = {},
  ip?: string | null,
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({ action, userId, meta, ip: ip ?? null });
  } catch (err) {
    log.error("audit write failed", { action, userId, err });
  }
}
