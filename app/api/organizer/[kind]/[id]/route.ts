import {
  deleteOrganizerItem,
  updateEvent,
  updateNote,
  updateTask,
  type EventUpdate,
  type NoteUpdate,
  type TaskUpdate,
} from "../../../../../db/queries";
import {
  apiJson,
  getApiUser,
  isShortText,
  isTrustedMutation,
  optionalDate,
  readJsonBody,
} from "../../../../../lib/http";
import type {
  OrganizerKind,
  TaskPriority,
  TaskStatus,
} from "../../../../../lib/organizer-types";

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

type UpdatePayload = Record<string, unknown>;

function isKind(value: string): value is OrganizerKind {
  return value === "task" || value === "note" || value === "event";
}

function isPriority(value: unknown): value is TaskPriority {
  return value === "low" || value === "medium" || value === "high";
}

function isStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "doing" || value === "done";
}

function cleanText(value: unknown, maxLength: number, allowEmpty = false) {
  return isShortText(value, maxLength, allowEmpty) ? value.trim() : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Faça login para continuar." }, 401);
  if (!isTrustedMutation(request)) {
    return apiJson({ error: "Origem da solicitação não permitida." }, 403);
  }

  const { kind, id } = await context.params;
  const payload = await readJsonBody<UpdatePayload>(request);
  if (!isKind(kind) || !id || !payload) {
    return apiJson({ error: "Solicitação inválida." }, 400);
  }

  try {
    if (kind === "task") {
      const input: TaskUpdate = {};
      if ("title" in payload) {
        const title = cleanText(payload.title, 180);
        if (title === null) return apiJson({ error: "Título inválido." }, 400);
        input.title = title;
      }
      if ("description" in payload) {
        const description = cleanText(payload.description, 4000, true);
        if (description === null) return apiJson({ error: "Descrição inválida." }, 400);
        input.description = description;
      }
      if ("status" in payload) {
        if (!isStatus(payload.status)) return apiJson({ error: "Status inválido." }, 400);
        input.status = payload.status;
      }
      if ("priority" in payload) {
        if (!isPriority(payload.priority)) return apiJson({ error: "Prioridade inválida." }, 400);
        input.priority = payload.priority;
      }
      if ("dueAt" in payload) {
        const dueAt = optionalDate(payload.dueAt);
        if (dueAt === undefined) return apiJson({ error: "Prazo inválido." }, 400);
        input.dueAt = dueAt;
      }
      if (!Object.keys(input).length) return apiJson({ error: "Nada para atualizar." }, 400);
      const item = await updateTask(user.userId, id, input);
      return item ? apiJson({ kind, item }) : apiJson({ error: "Item não encontrado." }, 404);
    }

    if (kind === "note") {
      const input: NoteUpdate = {};
      if ("title" in payload) {
        const title = cleanText(payload.title, 180);
        if (title === null) return apiJson({ error: "Título inválido." }, 400);
        input.title = title;
      }
      if ("content" in payload) {
        const content = cleanText(payload.content, 20000, true);
        if (content === null) return apiJson({ error: "Conteúdo inválido." }, 400);
        input.content = content;
      }
      if ("pinned" in payload) {
        if (typeof payload.pinned !== "boolean") return apiJson({ error: "Valor inválido." }, 400);
        input.pinned = payload.pinned;
      }
      if (!Object.keys(input).length) return apiJson({ error: "Nada para atualizar." }, 400);
      const item = await updateNote(user.userId, id, input);
      return item ? apiJson({ kind, item }) : apiJson({ error: "Item não encontrado." }, 404);
    }

    const input: EventUpdate = {};
    if ("title" in payload) {
      const title = cleanText(payload.title, 180);
      if (title === null) return apiJson({ error: "Título inválido." }, 400);
      input.title = title;
    }
    if ("description" in payload) {
      const description = cleanText(payload.description, 4000, true);
      if (description === null) return apiJson({ error: "Descrição inválida." }, 400);
      input.description = description;
    }
    if ("location" in payload) {
      const location = cleanText(payload.location, 300, true);
      if (location === null) return apiJson({ error: "Local inválido." }, 400);
      input.location = location;
    }
    if ("startsAt" in payload) {
      const startsAt = optionalDate(payload.startsAt);
      if (!startsAt) return apiJson({ error: "Data inicial inválida." }, 400);
      input.startsAt = startsAt;
    }
    if ("endsAt" in payload) {
      const endsAt = optionalDate(payload.endsAt);
      if (endsAt === undefined) return apiJson({ error: "Data final inválida." }, 400);
      input.endsAt = endsAt;
    }
    if ("allDay" in payload) {
      if (typeof payload.allDay !== "boolean") return apiJson({ error: "Valor inválido." }, 400);
      input.allDay = payload.allDay;
    }
    if (
      input.startsAt &&
      input.endsAt &&
      new Date(input.endsAt) < new Date(input.startsAt)
    ) {
      return apiJson({ error: "O fim deve acontecer depois do início." }, 400);
    }
    if (!Object.keys(input).length) return apiJson({ error: "Nada para atualizar." }, 400);
    const item = await updateEvent(user.userId, id, input);
    return item ? apiJson({ kind, item }) : apiJson({ error: "Item não encontrado." }, 404);
  } catch (error) {
    console.error("Organizer update failed", error);
    return apiJson({ error: "Não foi possível atualizar o item." }, 500);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getApiUser();
  if (!user) return apiJson({ error: "Faça login para continuar." }, 401);
  if (!isTrustedMutation(request)) {
    return apiJson({ error: "Origem da solicitação não permitida." }, 403);
  }

  const { kind, id } = await context.params;
  if (!isKind(kind) || !id) return apiJson({ error: "Solicitação inválida." }, 400);

  try {
    const deleted = await deleteOrganizerItem(user.userId, kind, id);
    return deleted
      ? apiJson({ deleted: true })
      : apiJson({ error: "Item não encontrado." }, 404);
  } catch (error) {
    console.error("Organizer delete failed", error);
    return apiJson({ error: "Não foi possível remover o item." }, 500);
  }
}
