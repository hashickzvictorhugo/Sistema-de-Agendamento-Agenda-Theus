import type { Metadata } from "next";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { isConfiguredAdmin } from "../../lib/admin-auth";
import { OrganizerApp } from "./OrganizerApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meu espaço",
  description: "Seu painel pessoal de tarefas, notas e compromissos.",
};

export default async function DashboardPage() {
  const user = await requireChatGPTUser("/app");

  return (
    <OrganizerApp
      user={{ displayName: user.displayName, email: user.email }}
      signOutHref={chatGPTSignOutPath("/")}
      nowIso={new Date().toISOString()}
      adminEligible={isConfiguredAdmin(user)}
    />
  );
}
