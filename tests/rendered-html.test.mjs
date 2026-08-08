import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(process.pid) + "-" + String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function environment(overrides = {}) {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    ...overrides,
  };
}

function context() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

test("renders the finished THEUS landing page for anonymous visitors", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment(),
    context(),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /THEUS/);
  assert.match(html, /Seu mundo, no lugar/);
  assert.match(html, /Entrar no THEUS/);
  assert.match(html, /\/signin-with-chatgpt\?return_to=/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("shows the signed-in entry point when identity headers are present", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-id": "user-test-1",
        "oai-authenticated-user-email": "matheus@example.com",
        "oai-authenticated-user-full-name": "Matheus%20Silva",
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      },
    }),
    environment(),
    context(),
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Abrir meu espaço/);
  assert.match(html, /href="\/app"/);
});

test("keeps API authentication and owner scoping in server code", async () => {
  const [route, queries] = await Promise.all([
    readFile(new URL("../app/api/organizer/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/queries.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getApiUser/);
  assert.match(route, /if \(!user\).*401/);
  assert.match(route, /isTrustedMutation/);
  assert.match(queries, /eq\(tasks\.ownerId, ownerId\)/);
  assert.match(queries, /eq\(notes\.ownerId, ownerId\)/);
  assert.match(queries, /eq\(events\.ownerId, ownerId\)/);
});

test("admin implementation keeps credentials server-side and signs short sessions", async () => {
  const [auth, sessionRoute, overviewRoute, dashboardPage, dashboardClient] = await Promise.all([
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/OrganizerApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(auth, /env\.ADMIN_PASSWORD_HASH/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /HMAC/);
  assert.match(auth, /__Host-theus_admin/);
  assert.match(auth, /SESSION_MAX_AGE_SECONDS = 15 \* 60/);
  assert.match(auth, /"Path=\/"/);
  assert.match(auth, /"HttpOnly"/);
  assert.match(auth, /"Secure"/);
  assert.match(auth, /"SameSite=Strict"/);
  assert.match(auth, /adminSessionCookie\("", 0\)/);
  assert.match(sessionRoute, /isStrictSameOrigin/);
  assert.match(sessionRoute, /recordAdminLoginFailure/);
  assert.match(overviewRoute, /verifyAdminSession\(request, user\.userId\)/);
  assert.match(dashboardPage, /adminEligible=\{isConfiguredAdmin\(user\)\}/);
  assert.match(dashboardClient, /\{adminEligible \? \(/);
  assert.match(dashboardClient, /onClick=\{\(\) => selectView\("admin"\)\}/);

  const firstDatabaseRead = sessionRoute.indexOf("const currentLock = await getAdminLock");
  assert.ok(sessionRoute.indexOf("isConfiguredAdmin(user)") < firstDatabaseRead);
  assert.ok(sessionRoute.indexOf("isStrictSameOrigin(request)") < firstDatabaseRead);
  assert.ok(
      overviewRoute.indexOf("verifyAdminSession(request, user.userId)") <
      overviewRoute.indexOf("const overview = await getAdminOverview(user.userId)"),
  );
});
