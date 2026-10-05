import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: tz("email_verified_at"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_stripe_customer_id_key").on(t.stripeCustomerId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: tz("expires_at").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["verify", "reset"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: tz("expires_at").notNull(),
    usedAt: tz("used_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_tokens_token_hash_key").on(t.tokenHash),
    index("email_tokens_user_kind_idx").on(t.userId, t.kind),
    index("email_tokens_expires_at_idx").on(t.expiresAt),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status", {
      enum: ["none", "trialing", "active", "past_due", "canceled", "incomplete", "unpaid"],
    }).notNull(),
    priceId: text("price_id"),
    interval: text("interval", { enum: ["month", "year"] }),
    currentPeriodEnd: tz("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_user_id_key").on(t.userId),
    uniqueIndex("subscriptions_stripe_subscription_id_key").on(t.stripeSubscriptionId),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    name: text("name").notNull(),
    platform: text("platform", { enum: ["windows", "macos", "linux"] }).notNull(),
    appVersion: text("app_version").notNull(),
    tokenHash: text("token_hash"),
    createdAt: tz("created_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at"),
    revokedAt: tz("revoked_at"),
  },
  (t) => [
    uniqueIndex("devices_user_fingerprint_key").on(t.userId, t.fingerprint),
    uniqueIndex("devices_token_hash_key").on(t.tokenHash),
    index("devices_user_active_idx").on(t.userId).where(sql`${t.revokedAt} is null`),
  ],
);

export const deviceAuthorizations = pgTable(
  "device_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCode: text("user_code").notNull(),
    fingerprint: text("fingerprint").notNull(),
    name: text("name").notNull(),
    platform: text("platform", { enum: ["windows", "macos", "linux"] }).notNull(),
    appVersion: text("app_version").notNull(),
    status: text("status", { enum: ["pending", "approved", "denied", "consumed"] })
      .notNull()
      .default("pending"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
    expiresAt: tz("expires_at").notNull(),
    lastPolledAt: tz("last_polled_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("device_authorizations_device_code_hash_key").on(t.deviceCodeHash),
    uniqueIndex("device_authorizations_user_code_key").on(t.userCode),
    index("device_authorizations_created_at_idx").on(t.createdAt),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["scan", "cleanup"] }).notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    fileCount: bigint("file_count", { mode: "number" }).notNull(),
    reclaimableBytes: bigint("reclaimable_bytes", { mode: "number" }).notNull(),
    freedBytes: bigint("freed_bytes", { mode: "number" }).notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
    appVersion: text("app_version").notNull(),
    categories: jsonb("categories")
      .$type<{ key: string; bytes: number; count: number }[]>()
      .notNull()
      .default([]),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reports_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("reports_device_id_idx").on(t.deviceId),
    index("reports_created_at_idx").on(t.createdAt),
  ],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: tz("processed_at").notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limits_window_start_idx").on(t.windowStart),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("audit_log_action_idx").on(t.action),
  ],
);

export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type DeviceAuthorization = typeof deviceAuthorizations.$inferSelect;
export type Report = typeof reports.$inferSelect;
