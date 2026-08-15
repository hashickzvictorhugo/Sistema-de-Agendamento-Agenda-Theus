import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["todo", "doing", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    dueAt: text("due_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_tasks_owner_status_due").on(
      table.ownerId,
      table.status,
      table.dueAt,
    ),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_notes_owner_pinned_updated").on(
      table.ownerId,
      table.pinned,
      table.updatedAt,
    ),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_events_owner_starts").on(table.ownerId, table.startsAt),
  ],
);

export const adminLoginLimits = sqliteTable("admin_login_limits", {
  subject: text("subject").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: integer("locked_until"),
  updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    subject: text("subject").notNull(),
    action: text("action", {
      enum: ["login_success", "login_failure", "logout"],
    }).notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_admin_audit_subject_created").on(table.subject, table.createdAt),
  ],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    nonce: text("nonce").primaryKey(),
    subject: text("subject").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_admin_sessions_subject_expires").on(
      table.subject,
      table.expiresAt,
    ),
  ],
);
