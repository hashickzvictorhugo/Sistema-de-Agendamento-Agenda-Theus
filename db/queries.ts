import { and, asc, desc, eq } from "drizzle-orm";
import type {
  CalendarEvent,
  Note,
  OrganizerData,
  Task,
  TaskPriority,
  TaskStatus,
} from "../lib/organizer-types";
import { getDb } from "./index";
import { events, notes, tasks } from "./schema";

export type TaskCreate = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string | null;
};

export type NoteCreate = {
  title: string;
  content: string;
  pinned: boolean;
};

export type EventCreate = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
};

export type TaskUpdate = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
}>;

export type NoteUpdate = Partial<{
  title: string;
  content: string;
  pinned: boolean;
}>;

export type EventUpdate = Partial<EventCreate>;

function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.dueAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: typeof events.$inferSelect): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listOrganizerData(ownerId: string): Promise<OrganizerData> {
  const db = getDb();
  const [taskRows, noteRows, eventRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(eq(tasks.ownerId, ownerId))
      .orderBy(desc(tasks.updatedAt), desc(tasks.createdAt))
      .limit(200),
    db
      .select()
      .from(notes)
      .where(eq(notes.ownerId, ownerId))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt))
      .limit(100),
    db
      .select()
      .from(events)
      .where(eq(events.ownerId, ownerId))
      .orderBy(asc(events.startsAt))
      .limit(200),
  ]);

  return {
    tasks: taskRows.map(toTask),
    notes: noteRows.map(toNote),
    events: eventRows.map(toEvent),
  };
}

export async function createTask(
  ownerId: string,
  input: TaskCreate,
): Promise<Task> {
  const [row] = await getDb()
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      ...input,
    })
    .returning();
  return toTask(row);
}

export async function createNote(
  ownerId: string,
  input: NoteCreate,
): Promise<Note> {
  const [row] = await getDb()
    .insert(notes)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      ...input,
    })
    .returning();
  return toNote(row);
}

export async function createEvent(
  ownerId: string,
  input: EventCreate,
): Promise<CalendarEvent> {
  const [row] = await getDb()
    .insert(events)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      ...input,
    })
    .returning();
  return toEvent(row);
}

export async function updateTask(
  ownerId: string,
  id: string,
  input: TaskUpdate,
): Promise<Task | null> {
  const [row] = await getDb()
    .update(tasks)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
    .returning();
  return row ? toTask(row) : null;
}

export async function updateNote(
  ownerId: string,
  id: string,
  input: NoteUpdate,
): Promise<Note | null> {
  const [row] = await getDb()
    .update(notes)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), eq(notes.ownerId, ownerId)))
    .returning();
  return row ? toNote(row) : null;
}

export async function updateEvent(
  ownerId: string,
  id: string,
  input: EventUpdate,
): Promise<CalendarEvent | null> {
  const [row] = await getDb()
    .update(events)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(events.id, id), eq(events.ownerId, ownerId)))
    .returning();
  return row ? toEvent(row) : null;
}

export async function deleteOrganizerItem(
  ownerId: string,
  kind: "task" | "note" | "event",
  id: string,
): Promise<boolean> {
  const db = getDb();
  if (kind === "task") {
    const rows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning({ id: tasks.id });
    return rows.length > 0;
  }
  if (kind === "note") {
    const rows = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.ownerId, ownerId)))
      .returning({ id: notes.id });
    return rows.length > 0;
  }
  const rows = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.ownerId, ownerId)))
    .returning({ id: events.id });
  return rows.length > 0;
}
