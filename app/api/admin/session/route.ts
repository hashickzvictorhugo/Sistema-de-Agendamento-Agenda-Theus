import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  isConfiguredAdmin,
  verifyAdminPassword,
} from "../../../../lib/admin-auth";
import {
  clearAdminLoginFailures,
  getAdminLock,
  recordAdminAudit,
  recordAdminLoginFailure,
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

  const currentLock = await getAdminLock(user.userId);
  if (currentLock.locked) {
    return apiJson(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      429,
      { "Retry-After": String(currentLock.retryAfterSeconds) },
    );
  }

  if (!(await verifyAdminPassword(body.password))) {
    const nextLock = await recordAdminLoginFailure(user.userId);
    await recordAdminAudit(user.userId, "login_failure");
    if (nextLock.locked) {
      return apiJson(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        429,
        { "Retry-After": String(nextLock.retryAfterSeconds) },
      );
    }
    return apiJson({ error: "Não foi possível liberar o painel." }, 401);
  }

  const session = await createAdminSession(user.userId);
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

  await recordAdminAudit(user.userId, "logout");
  return apiJson(
    { unlocked: false },
    200,
    { "Set-Cookie": clearAdminSessionCookie() },
  );
}
