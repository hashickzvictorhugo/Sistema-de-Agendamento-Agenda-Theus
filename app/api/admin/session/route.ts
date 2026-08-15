import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  isConfiguredAdmin,
  verifyAdminPassword,
  verifyAdminSession,
} from "../../../../lib/admin-auth";
import {
  clearAdminLoginFailures,
  getAdminLock,
  lockAdminLogin,
  recordAdminAudit,
  reserveAdminLoginAttempt,
  revokeAdminSession,
  saveAdminSession,
} from "../../../../db/admin";
import {
  apiJson,
  getApiUser,
  isStrictSameOrigin,
  readJsonBody,
} from "../../../../lib/http";

type LoginBody = { password?: unknown };

export async function POST(request: Request): Promise<Response> {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Entre na sua conta para continuar." }, 401);
  if (!isConfiguredAdmin(user)) {
    return apiJson({ error: "Acesso administrativo indisponível." }, 403);
  }
  if (!isStrictSameOrigin(request)) {
    return apiJson({ error: "Origem da solicitação não permitida." }, 403);
  }

  const body = await readJsonBody<LoginBody>(request);
  if (!body) return apiJson({ error: "Solicitação inválida." }, 400);

  const attempt = await reserveAdminLoginAttempt(user.userId);
  if (!attempt.allowed) {
    return apiJson(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      429,
      { "Retry-After": String(attempt.retryAfterSeconds) },
    );
  }

  if (!(await verifyAdminPassword(body.password))) {
    await recordAdminAudit(user.userId, "login_failure");
    if (attempt.attemptNumber >= 5) {
      const lock = await lockAdminLogin(user.userId);
      return apiJson(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        429,
        { "Retry-After": String(lock.retryAfterSeconds) },
      );
    }
    return apiJson({ error: "Não foi possível liberar o painel." }, 401);
  }

  const finalLock = await getAdminLock(user.userId);
  if (finalLock.locked) {
    return apiJson(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      429,
      { "Retry-After": String(finalLock.retryAfterSeconds) },
    );
  }

  const session = await createAdminSession(user.userId);
  await saveAdminSession(user.userId, session.nonce, session.expiresAt);
  await clearAdminLoginFailures(user.userId);
  await recordAdminAudit(user.userId, "login_success");
  return apiJson(
    { unlocked: true, expiresAt: new Date(session.expiresAt * 1000).toISOString() },
    200,
    { "Set-Cookie": adminSessionCookie(session.token) },
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Entre na sua conta para continuar." }, 401);
  if (!isConfiguredAdmin(user)) {
    return apiJson({ error: "Acesso administrativo indisponível." }, 403);
  }
  if (!isStrictSameOrigin(request)) {
    return apiJson({ error: "Origem da solicitação não permitida." }, 403);
  }

  const session = await verifyAdminSession(request, user.userId).catch(() => null);
  if (session) {
    await revokeAdminSession(user.userId, session.nonce).catch(() => undefined);
    await recordAdminAudit(user.userId, "logout").catch(() => undefined);
  }
  return apiJson(
    { unlocked: false },
    200,
    { "Set-Cookie": clearAdminSessionCookie() },
  );
}
