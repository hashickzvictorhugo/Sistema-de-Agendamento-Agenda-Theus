import assert from "node:assert/strict";
import test from "node:test";
import {
  adminSessionCookie,
  createAdminSession,
  isConfiguredAdmin,
  verifyAdminPassword,
  verifyAdminSession,
} from "../lib/admin-auth.ts";
import {
  getAdminOverview,
  reserveAdminLoginAttempt,
  revokeAdminSession,
  saveAdminSession,
} from "../db/admin.ts";
import { isStrictSameOrigin } from "../lib/request-security.ts";
import { createMemoryD1 } from "./support/d1-memory.mjs";

const ADMIN_USER_ID = "owner-user-id";
const ADMIN_PASSWORD = "correct-horse-battery-staple";
const ADMIN_PASSWORD_HASH = await createPasswordHash(ADMIN_PASSWORD);
const ADMIN_SESSION_SECRET = "test-session-secret-with-more-than-32-bytes";

test("owner authorization is bound to the stable user ID and valid configuration", () => {
  useEnvironment(createMemoryD1());
  assert.equal(isConfiguredAdmin({ userId: ADMIN_USER_ID }), true);
  assert.equal(isConfiguredAdmin({ userId: "different-user" }), false);

  globalThis.__THEUS_RUNTIME_ENV__.ADMIN_SESSION_SECRET = "too-short";
  assert.equal(isConfiguredAdmin({ userId: ADMIN_USER_ID }), false);
});

test("PBKDF2 password verification is exact and rejects malformed inputs", async () => {
  useEnvironment(createMemoryD1());
  assert.equal(await verifyAdminPassword(ADMIN_PASSWORD), true);
  assert.equal(await verifyAdminPassword(`${ADMIN_PASSWORD} `), false);
  assert.equal(await verifyAdminPassword("wrong-password"), false);
  assert.equal(await verifyAdminPassword(""), false);
  assert.equal(await verifyAdminPassword("x".repeat(513)), false);
});

test("signed sessions are persisted, user-bound, tamper-resistant and revocable", async () => {
  const memory = createMemoryD1();
  useEnvironment(memory);
  const session = await createAdminSession(ADMIN_USER_ID);
  await saveAdminSession(ADMIN_USER_ID, session.nonce, session.expiresAt);
  const cookie = adminSessionCookie(session.token).split(";", 1)[0];

  const valid = await verifyAdminSession(requestWithCookie(cookie), ADMIN_USER_ID);
  assert.equal(valid?.sub, ADMIN_USER_ID);
  assert.equal(valid?.nonce, session.nonce);
  assert.equal(await verifyAdminSession(requestWithCookie(cookie), "other-user"), null);

  const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;
  assert.equal(await verifyAdminSession(requestWithCookie(tampered), ADMIN_USER_ID), null);

  await revokeAdminSession(ADMIN_USER_ID, session.nonce);
  assert.equal(await verifyAdminSession(requestWithCookie(cookie), ADMIN_USER_ID), null);
});

test("parallel reservations allow at most five password checks", async () => {
  const memory = createMemoryD1();
  useEnvironment(memory);
  const attempts = await Promise.all(
    Array.from({ length: 20 }, () => reserveAdminLoginAttempt(ADMIN_USER_ID)),
  );

  assert.equal(attempts.filter((attempt) => attempt.allowed).length, 5);
  assert.equal(attempts.filter((attempt) => !attempt.allowed).length, 15);
  const limit = memory.sqlite.prepare(
    "SELECT failures, locked_until AS lockedUntil FROM admin_login_limits WHERE subject = ?",
  ).get(ADMIN_USER_ID);
  assert.equal(Number(limit.failures), 5);
  assert.ok(Number(limit.lockedUntil) > Date.now());
});

test("admin overview returns only the owner's aggregate data", async () => {
  const memory = createMemoryD1();
  useEnvironment(memory);
  memory.sqlite.prepare(
    "INSERT INTO tasks (id, owner_id, title, status) VALUES (?, ?, ?, ?)",
  ).run("owner-open", ADMIN_USER_ID, "Minha tarefa", "doing");
  memory.sqlite.prepare(
    "INSERT INTO tasks (id, owner_id, title, status) VALUES (?, ?, ?, ?)",
  ).run("other-done", "other-user", "Tarefa alheia", "done");
  memory.sqlite.prepare(
    "INSERT INTO notes (id, owner_id, title) VALUES (?, ?, ?)",
  ).run("owner-note", ADMIN_USER_ID, "Minha nota");

  const overview = await getAdminOverview(ADMIN_USER_ID);
  assert.deepEqual(overview.counts, {
    spacesWithContent: 1,
    tasks: 1,
    openTasks: 1,
    completedTasks: 0,
    notes: 1,
    events: 0,
    blockedLogins: 0,
  });
});

test("mutation origin checks fail closed", () => {
  assert.equal(
    isStrictSameOrigin(new Request("https://theus.example/api", {
      headers: { origin: "https://theus.example" },
    })),
    true,
  );
  assert.equal(isStrictSameOrigin(new Request("https://theus.example/api")), false);
  assert.equal(
    isStrictSameOrigin(new Request("https://theus.example/api", {
      headers: { origin: "https://attacker.example" },
    })),
    false,
  );
});

function useEnvironment(memory) {
  globalThis.__THEUS_RUNTIME_ENV__ = {
    DB: memory.database,
    ADMIN_OWNER_USER_ID: ADMIN_USER_ID,
    ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET,
  };
}

function requestWithCookie(cookie) {
  return new Request("https://theus.example/api/admin/overview", {
    headers: { cookie },
  });
}

async function createPasswordHash(password) {
  const iterations = 600_000;
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    passwordKey,
    256,
  ));
  return `pbkdf2-sha256$${iterations}$${Buffer.from(salt).toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}
