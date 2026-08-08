import type { AdminAuditAction, AdminOverview } from "../lib/admin-types";
import { getD1 } from "./index";

const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type LimitRow = {
  failures: number;
  lockedUntil: number | null;
};

type MetricsRow = {
  spacesWithContent: number;
  tasks: number;
  openTasks: number;
  completedTasks: number;
  notes: number;
  events: number;
  blockedLogins: number;
};

type AuditRow = {
  id: string;
  action: AdminAuditAction;
  createdAt: string;
};

export async function getAdminLock(
  subject: string,
  now = Date.now(),
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const row = await getD1()
    .prepare(
      "SELECT locked_until AS lockedUntil FROM admin_login_limits WHERE subject = ?",
    )
    .bind(subject)
    .first<{ lockedUntil: number | null }>();
  const lockedUntil = row?.lockedUntil ?? 0;
  return {
    locked: lockedUntil > now,
    retryAfterSeconds: Math.max(0, Math.ceil((lockedUntil - now) / 1000)),
  };
}

export async function recordAdminLoginFailure(
  subject: string,
  now = Date.now(),
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const nowIso = new Date(now).toISOString();
  const row = await getD1()
    .prepare(
      `INSERT INTO admin_login_limits
        (subject, window_started_at, failures, locked_until, updated_at)
       VALUES (?, ?, 1, NULL, ?)
       ON CONFLICT(subject) DO UPDATE SET
         failures = CASE
           WHEN admin_login_limits.locked_until > excluded.window_started_at
             THEN admin_login_limits.failures
           WHEN excluded.window_started_at - admin_login_limits.window_started_at >= ${WINDOW_MS}
             THEN 1
           ELSE admin_login_limits.failures + 1
         END,
         window_started_at = CASE
           WHEN admin_login_limits.locked_until > excluded.window_started_at
             THEN admin_login_limits.window_started_at
           WHEN excluded.window_started_at - admin_login_limits.window_started_at >= ${WINDOW_MS}
             THEN excluded.window_started_at
           ELSE admin_login_limits.window_started_at
         END,
         locked_until = CASE
           WHEN admin_login_limits.locked_until > excluded.window_started_at
             THEN admin_login_limits.locked_until
           WHEN excluded.window_started_at - admin_login_limits.window_started_at >= ${WINDOW_MS}
             THEN NULL
           WHEN admin_login_limits.failures + 1 >= ${MAX_FAILURES}
             THEN excluded.window_started_at + ${LOCK_MS}
           ELSE NULL
         END,
         updated_at = excluded.updated_at
       RETURNING failures, locked_until AS lockedUntil`,
    )
    .bind(subject, now, nowIso)
    .first<LimitRow>();
  const lockedUntil = row?.lockedUntil ?? 0;
  return {
    locked: lockedUntil > now,
    retryAfterSeconds: Math.max(0, Math.ceil((lockedUntil - now) / 1000)),
  };
}

export async function clearAdminLoginFailures(subject: string): Promise<void> {
  await getD1()
    .prepare("DELETE FROM admin_login_limits WHERE subject = ?")
    .bind(subject)
    .run();
}

export async function recordAdminAudit(
  subject: string,
  action: AdminAuditAction,
): Promise<void> {
  await getD1()
    .prepare(
      "INSERT INTO admin_audit_logs (id, subject, action, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), subject, action, new Date().toISOString())
    .run();
}

export async function getAdminOverview(subject: string): Promise<
  Omit<AdminOverview, "sessionExpiresAt">
> {
  const now = Date.now();
  const db = getD1();
  const [metrics, activity] = await Promise.all([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM (
            SELECT owner_id FROM tasks
            UNION SELECT owner_id FROM notes
            UNION SELECT owner_id FROM events
          )) AS spacesWithContent,
          (SELECT COUNT(*) FROM tasks) AS tasks,
          (SELECT COUNT(*) FROM tasks WHERE status != 'done') AS openTasks,
          (SELECT COUNT(*) FROM tasks WHERE status = 'done') AS completedTasks,
          (SELECT COUNT(*) FROM notes) AS notes,
          (SELECT COUNT(*) FROM events) AS events,
          (SELECT COUNT(*) FROM admin_login_limits WHERE locked_until > ?) AS blockedLogins`,
      )
      .bind(now)
      .first<MetricsRow>(),
    db
      .prepare(
        `SELECT id, action, created_at AS createdAt
         FROM admin_audit_logs
         WHERE subject = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
      )
      .bind(subject)
      .all<AuditRow>(),
  ]);

  return {
    counts: {
      spacesWithContent: Number(metrics?.spacesWithContent ?? 0),
      tasks: Number(metrics?.tasks ?? 0),
      openTasks: Number(metrics?.openTasks ?? 0),
      completedTasks: Number(metrics?.completedTasks ?? 0),
      notes: Number(metrics?.notes ?? 0),
      events: Number(metrics?.events ?? 0),
      blockedLogins: Number(metrics?.blockedLogins ?? 0),
    },
    recentActivity: activity.results.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
    })),
  };
}
