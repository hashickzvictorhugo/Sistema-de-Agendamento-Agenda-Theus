import {
  createEvent,
  createNote,
  createTask,
  listOrganizerData,
} from "../../../db/queries";
import {
  apiJson,
  getApiUser,
  isShortText,
  isTrustedMutation,
  optionalDate,
  readJsonBody,
} from "../../../lib/http";
import type { OrganizerKind, TaskPriority } from "../../../lib/organizer-types";

type CreatePayload = {
  kind?: OrganizerKind;
  title?: unknown;
  description?: unknown;
  content?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  pinned?: unknown;
  location?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  allDay?: unknown;
};

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return "";
  return isShortText(value, maxLength, true) ? value.trim() : null;
}

function isPriority(value: unknown): value is TaskPriority {
  return value === "low" || value === "medium" || value === "high";
}

export async function GET() {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Faça login para continuar." }, 401);

  try {
    return apiJson(await listOrganizerData(user.userId));
  } catch (error) {
    console.error("Organizer read failed", error);
    return apiJson({ error: "Não foi possível carregar seu espaço." }, 500);
  }
}

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Faça login para continuar." }, 401);
  if (!isTrustedMutation(request)) {
    return apiJson({ error: "Origem da solicitação não permitida." }, 403);
  }

  const payload = await readJsonBody<CreatePayload>(request);
  if (!payload || !payload.kind || !isShortText(payload.title, 180)) {
    return apiJson({ error: "Revise o tipo e o título do item." }, 400);
  }

  const title = payload.title.trim();

  try {
    if (payload.kind === "task") {
      const description = cleanOptionalText(payload.description, 4000);
      const dueAt = optionalDate(payload.dueAt);
      if (
        description === null ||
        dueAt === undefined ||
        (payload.priority !== undefined && !isPriority(payload.priority))
      ) {
        return apiJson({ error: "Revise os dados da tarefa." }, 400);
      }
      const item = await createTask(user.userId, {
        title,
        description,
        priority: payload.priority ?? "medium",
        dueAt,
      });
      return apiJson({ kind: "task", item }, 201);
    }

    if (payload.kind === "note") {
      const content = cleanOptionalText(payload.content, 20000);
      if (
        content === null ||
        (payload.pinned !== undefined && typeof payload.pinned !== "boolean")
      ) {
        return apiJson({ error: "Revise os dados da nota." }, 400);
      }
      const item = await createNote(user.userId, {
        title,
        content,
        pinned: payload.pinned ?? false,
      });
      return apiJson({ kind: "note", item }, 201);
    }

    if (payload.kind === "event") {
      const startsAt = optionalDate(payload.startsAt);
      const endsAt = optionalDate(payload.endsAt);
      const description = cleanOptionalText(payload.description, 4000);
      const location = cleanOptionalText(payload.location, 300);
      if (
        !startsAt ||
        endsAt === undefined ||
        description === null ||
        location === null ||
        (endsAt && new Date(endsAt) < new Date(startsAt)) ||
        (payload.allDay !== undefined && typeof payload.allDay !== "boolean")
      ) {
        return apiJson({ error: "Revise as datas e os dados do compromisso." }, 400);
      }
      const item = await createEvent(user.userId, {
        title,
        description,
        location,
        startsAt,
        endsAt,
        allDay: payload.allDay ?? false,
      });
      return apiJson({ kind: "event", item }, 201);
    }

    return apiJson({ error: "Tipo de item inválido." }, 400);
  } catch (error) {
    console.error("Organizer create failed", error);
    return apiJson({ error: "Não foi possível salvar o item." }, 500);
  }
}
