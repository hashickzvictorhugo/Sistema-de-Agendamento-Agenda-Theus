import type { AdminAuditAction, AdminOverview } from "../lib/admin-types";
import { getD1 } from "./index";

const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type LimitRow = {
  failures: number;
  lockedUntil: number | null;
};

export type AdminLoginAttempt = {
  allowed: boolean;
  attemptNumber: number;
  retryAfterSeconds: number;
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

export async function reserveAdminLoginAttempt(
  subject: string,
  now = Date.now(),
): Promise<AdminLoginAttempt> {
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
           WHEN admin_login_limits.failures >= ${MAX_FAILURES}
             THEN admin_login_limits.failures
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
           WHEN admin_login_limits.failures >= ${MAX_FAILURES}
             THEN excluded.window_started_at + ${LOCK_MS}
           ELSE NULL
         END,
         updated_at = excluded.updated_at
       RETURNING failures, locked_until AS lockedUntil`,
    )
    .bind(subject, now, nowIso)
    .first<LimitRow>();
  const lockedUntil = row?.lockedUntil ?? 0;
  const locked = !row || lockedUntil > now;
  return {
    allowed: !locked,
    attemptNumber: Number(row?.failures ?? MAX_FAILURES + 1),
    retryAfterSeconds: locked
      ? Math.max(1, Math.ceil((lockedUntil - now) / 1000))
      : 0,
  };
}

export async function lockAdminLogin(
  subject: string,
  now = Date.now(),
): Promise<{ retryAfterSeconds: number }> {
  const lockedUntil = now + LOCK_MS;
  await getD1()
    .prepare(
      `UPDATE admin_login_limits
       SET locked_until = ?, updated_at = ?
       WHERE subject = ?`,
    )
    .bind(lockedUntil, new Date(now).toISOString(), subject)
    .run();
  return { retryAfterSeconds: Math.ceil(LOCK_MS / 1000) };
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
  const db = getD1();
  await db.batch([
    db
      .prepare(
        "INSERT INTO admin_audit_logs (id, subject, action, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), subject, action, new Date().toISOString()),
    db
      .prepare(
        `DELETE FROM admin_audit_logs
         WHERE subject = ?
           AND id NOT IN (
             SELECT id FROM admin_audit_logs
             WHERE subject = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100
           )`,
      )
      .bind(subject, subject),
  ]);
}

export async function saveAdminSession(
  subject: string,
  nonce: string,
  expiresAt: number,
): Promise<void> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db
      .prepare(
        `DELETE FROM admin_sessions
         WHERE expires_at <= ? OR revoked_at IS NOT NULL`,
      )
      .bind(now),
    db
      .prepare(
        `INSERT INTO admin_sessions
          (nonce, subject, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, NULL, ?)`,
      )
      .bind(nonce, subject, expiresAt, new Date().toISOString()),
  ]);
}

export async function isAdminSessionActive(
  subject: string,
  nonce: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const row = await getD1()
    .prepare(
      `SELECT nonce FROM admin_sessions
       WHERE nonce = ? AND subject = ?
         AND revoked_at IS NULL AND expires_at > ?`,
    )
    .bind(nonce, subject, now)
    .first<{ nonce: string }>();
  return row?.nonce === nonce;
}

export async function revokeAdminSession(
  subject: string,
  nonce: string,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await getD1()
    .prepare(
      `UPDATE admin_sessions
       SET revoked_at = ?
       WHERE nonce = ? AND subject = ? AND revoked_at IS NULL`,
    )
    .bind(now, nonce, subject)
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
          CASE WHEN
            EXISTS(SELECT 1 FROM tasks WHERE owner_id = ?)
            OR EXISTS(SELECT 1 FROM notes WHERE owner_id = ?)
            OR EXISTS(SELECT 1 FROM events WHERE owner_id = ?)
          THEN 1 ELSE 0 END AS spacesWithContent,
          (SELECT COUNT(*) FROM tasks WHERE owner_id = ?) AS tasks,
          (SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status != 'done') AS openTasks,
          (SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND status = 'done') AS completedTasks,
          (SELECT COUNT(*) FROM notes WHERE owner_id = ?) AS notes,
          (SELECT COUNT(*) FROM events WHERE owner_id = ?) AS events,
          (SELECT COUNT(*) FROM admin_login_limits WHERE subject = ? AND locked_until > ?) AS blockedLogins`,
      )
      .bind(
        subject,
        subject,
        subject,
        subject,
        subject,
        subject,
        subject,
        subject,
        subject,
        now,
      )
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
