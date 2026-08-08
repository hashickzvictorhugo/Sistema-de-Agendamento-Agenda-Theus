import { getAdminOverview } from "../../../../db/admin";
import {
  clearAdminSessionCookie,
  isConfiguredAdmin,
  verifyAdminSession,
} from "../../../../lib/admin-auth";
import { apiJson, getApiUser } from "../../../../lib/http";

export async function GET(request: Request): Promise<Response> {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Entre na sua conta para continuar." }, 401);
  if (!isConfiguredAdmin(user)) {
    return apiJson({ error: "Acesso administrativo indisponível." }, 403);
  }

  const session = await verifyAdminSession(request, user.userId);
  if (!session) {
    return apiJson(
      { error: "Confirme a senha administrativa para continuar." },
      401,
      { "Set-Cookie": clearAdminSessionCookie() },
    );
  }

  const overview = await getAdminOverview(user.userId);
  return apiJson({
    ...overview,
    sessionExpiresAt: new Date(session.exp * 1000).toISOString(),
  });
}
