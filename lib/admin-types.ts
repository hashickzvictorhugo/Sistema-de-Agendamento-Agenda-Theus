export type AdminAuditAction =
  | "login_success"
  | "login_failure"
  | "logout";

export type AdminOverview = {
  counts: {
    spacesWithContent: number;
    tasks: number;
    openTasks: number;
    completedTasks: number;
    notes: number;
    events: number;
    blockedLogins: number;
  };
  recentActivity: Array<{
    id: string;
    action: AdminAuditAction;
    createdAt: string;
  }>;
  sessionExpiresAt: string;
};
