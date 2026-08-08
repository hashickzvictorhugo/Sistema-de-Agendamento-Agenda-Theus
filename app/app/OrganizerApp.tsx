"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import Link from "next/link";
import type {
  CalendarEvent,
  Note,
  OrganizerData,
  OrganizerKind,
  Task,
  TaskPriority,
  TaskStatus,
} from "../../lib/organizer-types";
import type { AdminOverview } from "../../lib/admin-types";

type View = "overview" | "tasks" | "notes" | "agenda" | "admin";

type OrganizerAppProps = {
  user: {
    displayName: string;
    email: string;
  };
  signOutHref: string;
  nowIso: string;
  adminEligible: boolean;
};

const emptyData: OrganizerData = {
  tasks: [],
  notes: [],
  events: [],
};

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "overview", label: "Hoje", glyph: "⌂" },
  { id: "tasks", label: "Tarefas", glyph: "✓" },
  { id: "notes", label: "Notas", glyph: "□" },
  { id: "agenda", label: "Agenda", glyph: "◷" },
];

const typeLabels: Record<OrganizerKind, string> = {
  task: "Tarefa",
  note: "Nota",
  event: "Compromisso",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const adminActivityLabels: Record<
  AdminOverview["recentActivity"][number]["action"],
  string
> = {
  login_success: "Painel desbloqueado",
  login_failure: "Tentativa recusada",
  logout: "Painel bloqueado",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function firstName(displayName: string, email: string): string {
  const safeName = displayName.includes("@") ? email.split("@")[0] : displayName;
  return safeName.trim().split(/\s+/)[0] || "Matheus";
}

function greetingFor(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(date),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function isSameDay(first: Date, second: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return formatter.format(first) === formatter.format(second);
}

function formatTaskDate(value: string | null, now: Date): string {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  if (isSameDay(date, now)) return "Hoje, " + timeFormatter.format(date);
  return shortDateFormatter.format(date) + ", " + timeFormatter.format(date);
}

function formatEventDate(value: string, now: Date): string {
  const date = new Date(value);
  if (isSameDay(date, now)) return "Hoje · " + timeFormatter.format(date);
  return shortDateFormatter.format(date) + " · " + timeFormatter.format(date);
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function matchesSearch(values: Array<string | null>, query: string): boolean {
  if (!query) return true;
  return values.some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
}

function DashboardSkeleton() {
  return (
    <SkeletonTheme baseColor="#240c10" highlightColor="#3a1219">
      <div className="dashboard-skeleton" role="status" aria-label="Carregando seu espaço">
        <Skeleton height={184} borderRadius={22} />
        <div className="skeleton-split">
          <Skeleton height={320} borderRadius={22} />
          <Skeleton height={320} borderRadius={22} />
        </div>
      </div>
    </SkeletonTheme>
  );
}

function EmptyState({
  kind,
  onAdd,
}: {
  kind: OrganizerKind;
  onAdd: (kind: OrganizerKind) => void;
}) {
  const copy = {
    task: ["Nada te cobrando por aqui.", "Crie a primeira tarefa e deixe o THEUS lembrar por você."],
    note: ["As ideias ainda têm bastante espaço.", "Guarde uma referência, pensamento ou lista para voltar depois."],
    event: ["Agenda livre por enquanto.", "Adicione um compromisso e enxergue o ritmo dos próximos dias."],
  }[kind];

  return (
    <div className="empty-state">
      <span aria-hidden="true">{kind === "task" ? "✓" : kind === "note" ? "□" : "◷"}</span>
      <h3>{copy[0]}</h3>
      <p>{copy[1]}</p>
      <button className="button button-red" type="button" onClick={() => onAdd(kind)}>
        + Criar {typeLabels[kind].toLocaleLowerCase("pt-BR")}
      </button>
    </div>
  );
}

export function OrganizerApp({
  user,
  signOutHref,
  nowIso,
  adminEligible,
}: OrganizerAppProps) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const name = firstName(user.displayName, user.email);
  const [data, setData] = useState<OrganizerData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeView, setActiveView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<"open" | "all" | "done">("open");
  const [modalKind, setModalKind] = useState<OrganizerKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminStatus, setAdminStatus] = useState<
    "idle" | "checking" | "locked" | "ready"
  >("idle");
  const [adminError, setAdminError] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/organizer", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as OrganizerData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar");
      setData({ tasks: body.tasks, notes: body.notes, events: body.events });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar seu espaço.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdminOverview = useCallback(async () => {
    if (!adminEligible) return;
    setAdminStatus("checking");
    setAdminError("");
    try {
      const response = await fetch("/api/admin/overview", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as AdminOverview & { error?: string };
      if (response.status === 401) {
        setAdminOverview(null);
        setAdminStatus("locked");
        return;
      }
      if (!response.ok) throw new Error(body.error || "O painel admin não respondeu.");
      setAdminOverview(body);
      setAdminStatus("ready");
    } catch (error) {
      setAdminOverview(null);
      setAdminStatus("locked");
      setAdminError(
        error instanceof Error ? error.message : "O painel admin não respondeu.",
      );
    }
  }, [adminEligible]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeModal = useCallback(() => {
    setModalKind(null);
    setFormError("");
    window.setTimeout(() => previousFocus.current?.focus(), 0);
  }, [setFormError, setModalKind]);

  const openModal = useCallback((kind: OrganizerKind = "task") => {
    previousFocus.current = document.activeElement as HTMLElement;
    setFormError("");
    setModalKind(kind);
  }, [setFormError, setModalKind]);

  useEffect(() => {
    if (!modalKind) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => titleInputRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, modalKind]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (!typing && !modalKind && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openModal("task");
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [modalKind, openModal]);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

  const filteredTasks = useMemo(() => {
    return data.tasks.filter((task) => {
      const inStatus =
        taskFilter === "all" ||
        (taskFilter === "done" ? task.status === "done" : task.status !== "done");
      return (
        inStatus &&
        matchesSearch([task.title, task.description], normalizedQuery)
      );
    });
  }, [data.tasks, normalizedQuery, taskFilter]);

  const filteredNotes = useMemo(
    () =>
      data.notes.filter((note) =>
        matchesSearch([note.title, note.content], normalizedQuery),
      ),
    [data.notes, normalizedQuery],
  );

  const filteredEvents = useMemo(
    () =>
      data.events.filter((event) =>
        matchesSearch(
          [event.title, event.description, event.location],
          normalizedQuery,
        ),
      ),
    [data.events, normalizedQuery],
  );

  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const completedTasks = data.tasks.filter((task) => task.status === "done");
  const focusTask =
    openTasks.find((task) => task.priority === "high") ?? openTasks[0] ?? null;
  const progress = data.tasks.length
    ? Math.round((completedTasks.length / data.tasks.length) * 100)
    : 0;
  const upcomingEvents = data.events
    .filter((event) => new Date(event.startsAt) >= new Date(now.getTime() - 86400000))
    .slice(0, 5);
  const todayTasks = openTasks
    .filter((task) => !task.dueAt || isSameDay(new Date(task.dueAt), now))
    .slice(0, 5);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalKind) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) {
      setFormError("Dê um título para encontrar isso depois.");
      return;
    }

    const payload: Record<string, unknown> = { kind: modalKind, title };
    if (modalKind === "task") {
      payload.description = String(form.get("description") ?? "");
      payload.priority = String(form.get("priority") ?? "medium");
      const dueAt = String(form.get("dueAt") ?? "");
      payload.dueAt = dueAt ? new Date(dueAt).toISOString() : null;
    } else if (modalKind === "note") {
      payload.content = String(form.get("content") ?? "");
      payload.pinned = form.get("pinned") === "on";
    } else {
      payload.description = String(form.get("description") ?? "");
      payload.location = String(form.get("location") ?? "");
      const startsAt = String(form.get("startsAt") ?? "");
      const endsAt = String(form.get("endsAt") ?? "");
      if (!startsAt) {
        setFormError("Escolha quando o compromisso começa.");
        return;
      }
      payload.startsAt = new Date(startsAt).toISOString();
      payload.endsAt = endsAt ? new Date(endsAt).toISOString() : null;
      payload.allDay = form.get("allDay") === "on";
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/organizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        kind?: OrganizerKind;
        item?: Task | Note | CalendarEvent;
        error?: string;
      };
      if (!response.ok || !body.kind || !body.item) {
        throw new Error(body.error || "Não foi possível salvar.");
      }

      setData((current) => {
        if (body.kind === "task") {
          return { ...current, tasks: [body.item as Task, ...current.tasks] };
        }
        if (body.kind === "note") {
          return { ...current, notes: [body.item as Note, ...current.notes] };
        }
        return {
          ...current,
          events: [...current.events, body.item as CalendarEvent].sort(
            (a, b) => a.startsAt.localeCompare(b.startsAt),
          ),
        };
      });
      setToast(typeLabels[body.kind] + " guardado com sucesso.");
      closeModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: Task) {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === task.id ? { ...item, status: nextStatus } : item,
      ),
    }));

    try {
      const response = await fetch("/api/organizer/task/" + task.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await response.json()) as { item?: Task; error?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.error || "Não foi possível atualizar.");
      }
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id ? body.item as Task : item,
        ),
      }));
      setToast(nextStatus === "done" ? "Tarefa concluída. Boa." : "Tarefa reaberta.");
    } catch (error) {
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id ? task : item,
        ),
      }));
      setToast(error instanceof Error ? error.message : "Não foi possível atualizar.");
    }
  }

  async function togglePinned(note: Note) {
    const optimistic = { ...note, pinned: !note.pinned };
    setData((current) => ({
      ...current,
      notes: current.notes.map((item) => item.id === note.id ? optimistic : item),
    }));

    try {
      const response = await fetch("/api/organizer/note/" + note.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      const body = (await response.json()) as { item?: Note; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Não foi possível atualizar.");
      setData((current) => ({
        ...current,
        notes: current.notes
          .map((item) => item.id === note.id ? body.item as Note : item)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      }));
      setToast(note.pinned ? "Nota desafixada." : "Nota fixada no topo.");
    } catch (error) {
      setData((current) => ({
        ...current,
        notes: current.notes.map((item) => item.id === note.id ? note : item),
      }));
      setToast(error instanceof Error ? error.message : "Não foi possível atualizar.");
    }
  }

  async function deleteItem(kind: OrganizerKind, id: string, title: string) {
    if (!window.confirm("Remover “" + title + "”? Essa ação não pode ser desfeita.")) return;

    try {
      const response = await fetch("/api/organizer/" + kind + "/" + id, {
        method: "DELETE",
      });
      const body = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !body.deleted) throw new Error(body.error || "Não foi possível remover.");
      setData((current) => ({
        tasks: kind === "task" ? current.tasks.filter((item) => item.id !== id) : current.tasks,
        notes: kind === "note" ? current.notes.filter((item) => item.id !== id) : current.notes,
        events: kind === "event" ? current.events.filter((item) => item.id !== id) : current.events,
      }));
      setToast("Item removido.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  }

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setAdminSubmitting(true);
    setAdminError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Não foi possível liberar o painel.");
      }
      form.reset();
      setShowAdminPassword(false);
      await loadAdminOverview();
      setToast("Painel administrativo desbloqueado.");
    } catch (error) {
      setAdminStatus("locked");
      setAdminError(
        error instanceof Error ? error.message : "Não foi possível liberar o painel.",
      );
    } finally {
      setAdminSubmitting(false);
    }
  }

  async function lockAdminPanel() {
    setAdminSubmitting(true);
    setAdminError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível bloquear o painel.");
      setAdminOverview(null);
      setAdminStatus("locked");
      setToast("Painel administrativo bloqueado.");
    } catch (error) {
      setAdminError(
        error instanceof Error ? error.message : "Não foi possível bloquear o painel.",
      );
    } finally {
      setAdminSubmitting(false);
    }
  }

  function selectView(view: View) {
    if (view === "admin" && !adminEligible) return;
    setActiveView(view);
    setQuery("");
    if (view === "tasks") setTaskFilter("open");
    if (view === "admin") void loadAdminOverview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNavKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + direction + navItems.length) % navItems.length;
    const next = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[nextIndex];
    next?.focus();
  }

  const renderTask = (task: Task, compact = false) => (
    <div className={"task-row " + (task.status === "done" ? "is-done" : "")} key={task.id}>
      <button
        className="task-check"
        type="button"
        onClick={() => void toggleTask(task)}
        aria-label={task.status === "done" ? "Reabrir " + task.title : "Concluir " + task.title}
      >
        {task.status === "done" ? "✓" : ""}
      </button>
      <div className="task-copy">
        <strong>{task.title}</strong>
        <span>
          <i className={"priority-dot " + task.priority} />
          {formatTaskDate(task.dueAt, now)} · {priorityLabels[task.priority]}
        </span>
        {!compact && task.description ? <p>{task.description}</p> : null}
      </div>
      <button
        className="item-action"
        type="button"
        onClick={() => void deleteItem("task", task.id, task.title)}
        aria-label={"Remover " + task.title}
        title="Remover"
      >
        ×
      </button>
    </div>
  );

  const renderNote = (note: Note) => (
    <article className={"note-card " + (note.pinned ? "is-pinned" : "")} key={note.id}>
      <div className="note-card-head">
        <span>{note.pinned ? "FIXADA" : "NOTA"}</span>
        <div>
          <button
            type="button"
            onClick={() => void togglePinned(note)}
            aria-label={note.pinned ? "Desafixar nota" : "Fixar nota"}
            title={note.pinned ? "Desafixar" : "Fixar"}
          >
            {note.pinned ? "◆" : "◇"}
          </button>
          <button
            type="button"
            onClick={() => void deleteItem("note", note.id, note.title)}
            aria-label={"Remover " + note.title}
            title="Remover"
          >
            ×
          </button>
        </div>
      </div>
      <h3>{note.title}</h3>
      <p>{note.content || "Sem conteúdo adicional."}</p>
      <time>{shortDateFormatter.format(new Date(note.updatedAt))}</time>
    </article>
  );

  const renderEvent = (event: CalendarEvent) => (
    <li className="event-row" key={event.id}>
      <div className="event-time">
        <strong>{timeFormatter.format(new Date(event.startsAt))}</strong>
        <span>{shortDateFormatter.format(new Date(event.startsAt))}</span>
      </div>
      <i aria-hidden="true" />
      <div className="event-card">
        <span>{formatEventDate(event.startsAt, now)}</span>
        <h3>{event.title}</h3>
        {event.location ? <p>⌖ {event.location}</p> : null}
        {event.description ? <small>{event.description}</small> : null}
      </div>
      <button
        className="item-action"
        type="button"
        onClick={() => void deleteItem("event", event.id, event.title)}
        aria-label={"Remover " + event.title}
        title="Remover"
      >
        ×
      </button>
    </li>
  );

  return (
    <div className="organizer-shell">
      <aside className="app-sidebar">
        <Link className="brand-lockup app-brand" href="/" aria-label="THEUS, início">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span><strong>THEUS</strong><small>Seu mundo, no lugar.</small></span>
        </Link>
        <button className="quick-add" type="button" onClick={() => openModal("task")}>
          <span>＋</span> Guardar algo <kbd>N</kbd>
        </button>
        <nav aria-label="Áreas do organizador">
          <p>MEU ESPAÇO</p>
          {navItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "active" : ""}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => selectView(item.id)}
              onKeyDown={(event) => handleNavKeyDown(event, index)}
            >
              <span aria-hidden="true">{item.glyph}</span>
              {item.label}
              {item.id === "tasks" && openTasks.length > 0 ? <b>{openTasks.length}</b> : null}
            </button>
          ))}
        </nav>
        {adminEligible ? (
          <div className="owner-admin">
            <p>PROPRIETÁRIO</p>
            <button
              type="button"
              className={activeView === "admin" ? "active" : ""}
              aria-current={activeView === "admin" ? "page" : undefined}
              onClick={() => selectView("admin")}
            >
              <span aria-hidden="true">◆</span>
              <span><strong>Admin</strong><small>Centro de controle</small></span>
              <b>ADM</b>
            </button>
          </div>
        ) : null}
        <div className="sidebar-security">
          <span aria-hidden="true">◎</span>
          <p><strong>Espaço protegido</strong><small>Dados privados por conta</small></p>
        </div>
        <div className="sidebar-user">
          <span>{initials(name)}</span>
          <p><strong>{name}</strong><small>Tudo sincronizado</small></p>
          <a href={signOutHref} title="Sair da conta" aria-label="Sair da conta">↗</a>
        </div>
      </aside>

      <main className="app-content">
        <header className="app-topbar">
          <button className="mobile-brand" type="button" onClick={() => selectView("overview")} aria-label="Ir para Hoje">
            <span>T</span> THEUS
          </button>
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procure qualquer coisa…"
              aria-label="Buscar no THEUS"
            />
            <kbd>Ctrl K</kbd>
          </label>
          <button className="top-add" type="button" onClick={() => openModal("task")}>
            <span>＋</span> Novo item
          </button>
          {adminEligible ? (
            <button
              className={"top-admin " + (activeView === "admin" ? "active" : "")}
              type="button"
              onClick={() => selectView("admin")}
              aria-label="Abrir painel administrativo"
            >
              ◆ <span>Admin</span>
            </button>
          ) : null}
          <span className="top-avatar" title={user.email}>{initials(name)}</span>
        </header>

        <div className="app-page">
          <div className="page-heading">
            <div>
              {activeView === "admin" ? (
                <>
                  <p>ACESSO DO PROPRIETÁRIO</p>
                  <h1>Centro de controle.</h1>
                  <span>Segurança e visão geral do THEUS, sem expor conteúdo pessoal.</span>
                </>
              ) : (
                <>
                  <p>{dateFormatter.format(now).toLocaleUpperCase("pt-BR")}</p>
                  <h1>{greetingFor(now)}, {name}.</h1>
                  <span>
                    {openTasks.length === 0
                      ? "Tudo tranquilo por aqui. Aproveite o espaço."
                      : openTasks.length === 1
                        ? "Uma coisa pede sua atenção."
                        : openTasks.length + " coisas pedem sua atenção."}
                  </span>
                </>
              )}
            </div>
            {activeView !== "admin" ? (
              <button className="button button-red mobile-new" type="button" onClick={() => openModal("task")}>
                + Novo item
              </button>
            ) : null}
          </div>

          {activeView === "admin" && adminEligible ? (
            <section className="admin-view" aria-labelledby="admin-view-title">
              <div className="admin-view-head">
                <div>
                  <span>THEUS / ADMIN</span>
                  <h2 id="admin-view-title">Painel do proprietário</h2>
                  <p>Acesso elevado, protegido por uma segunda verificação.</p>
                </div>
                <span className="admin-readonly">SOMENTE LEITURA</span>
              </div>

              {adminStatus === "checking" ? (
                <div className="admin-loading" role="status">
                  <span aria-hidden="true">◆</span>
                  <p><strong>Verificando sua sessão…</strong><small>Um instante.</small></p>
                </div>
              ) : adminStatus === "ready" && adminOverview ? (
                <>
                  <div className="admin-session-bar">
                    <div>
                      <span aria-hidden="true">●</span>
                      <p>
                        <strong>Admin desbloqueado</strong>
                        <small>
                          Sessão protegida até {timeFormatter.format(new Date(adminOverview.sessionExpiresAt))}
                        </small>
                      </p>
                    </div>
                    <div>
                      <button type="button" onClick={() => void loadAdminOverview()}>
                        ↻ Atualizar
                      </button>
                      <button type="button" onClick={() => void lockAdminPanel()} disabled={adminSubmitting}>
                        ◇ Bloquear painel
                      </button>
                    </div>
                  </div>

                  <div className="admin-metrics" aria-label="Métricas do THEUS">
                    <article className="admin-metric admin-metric-primary">
                      <span>ESPAÇOS COM CONTEÚDO</span>
                      <strong>{adminOverview.counts.spacesWithContent}</strong>
                      <small>contas que já guardaram algo</small>
                    </article>
                    <article className="admin-metric">
                      <span>TAREFAS</span>
                      <strong>{adminOverview.counts.tasks}</strong>
                      <small>{adminOverview.counts.openTasks} abertas · {adminOverview.counts.completedTasks} concluídas</small>
                    </article>
                    <article className="admin-metric">
                      <span>NOTAS</span>
                      <strong>{adminOverview.counts.notes}</strong>
                      <small>itens guardados</small>
                    </article>
                    <article className="admin-metric">
                      <span>EVENTOS</span>
                      <strong>{adminOverview.counts.events}</strong>
                      <small>compromissos cadastrados</small>
                    </article>
                  </div>

                  <div className="admin-grid">
                    <section className="admin-panel">
                      <div className="admin-panel-head">
                        <div><span>SAÚDE DO SISTEMA</span><h3>Proteções ativas</h3></div>
                        <b>OPERACIONAL</b>
                      </div>
                      <ul className="admin-health-list">
                        <li><i>✓</i><span><strong>Banco conectado</strong><small>D1 persistente e isolado por conta</small></span><b>OK</b></li>
                        <li><i>✓</i><span><strong>Login do proprietário</strong><small>Identidade da conta + senha administrativa</small></span><b>OK</b></li>
                        <li><i>✓</i><span><strong>Sessão curta</strong><small>Cookie assinado, privado e com expiração automática</small></span><b>15 MIN</b></li>
                        <li className={adminOverview.counts.blockedLogins ? "is-warning" : ""}>
                          <i>{adminOverview.counts.blockedLogins ? "!" : "✓"}</i>
                          <span><strong>Proteção contra tentativas</strong><small>Bloqueio temporário após falhas repetidas</small></span>
                          <b>{adminOverview.counts.blockedLogins ? adminOverview.counts.blockedLogins + " BLOQ." : "LIVRE"}</b>
                        </li>
                      </ul>
                    </section>

                    <section className="admin-panel">
                      <div className="admin-panel-head">
                        <div><span>TRILHA DE SEGURANÇA</span><h3>Atividade recente</h3></div>
                      </div>
                      {adminOverview.recentActivity.length ? (
                        <ol className="admin-activity-list">
                          {adminOverview.recentActivity.map((activity) => (
                            <li key={activity.id}>
                              <i className={activity.action === "login_failure" ? "failure" : ""} aria-hidden="true" />
                              <span><strong>{adminActivityLabels[activity.action]}</strong><small>Conta proprietária</small></span>
                              <time dateTime={activity.createdAt}>
                                {shortDateFormatter.format(new Date(activity.createdAt))} · {timeFormatter.format(new Date(activity.createdAt))}
                              </time>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="admin-activity-empty">Nenhuma atividade administrativa registrada ainda.</div>
                      )}
                    </section>
                  </div>
                  {adminError ? <p className="admin-error" role="alert">{adminError}</p> : null}
                </>
              ) : (
                <div className="admin-unlock-layout">
                  <div className="admin-unlock-card">
                    <span className="admin-lock-icon" aria-hidden="true">◆</span>
                    <p>SEGUNDA VERIFICAÇÃO</p>
                    <h3>Confirme que é você.</h3>
                    <span className="admin-unlock-copy">
                      Sua conta já foi reconhecida como proprietária. Agora use a senha administrativa para liberar este painel por 15 minutos.
                    </span>
                    <form onSubmit={handleAdminLogin}>
                      <label htmlFor="admin-password">Senha administrativa</label>
                      <div className="admin-password-field">
                        <input
                          id="admin-password"
                          name="password"
                          type={showAdminPassword ? "text" : "password"}
                          autoComplete="current-password"
                          maxLength={512}
                          required
                          aria-describedby={adminError ? "admin-error" : "admin-password-help"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword((visible) => !visible)}
                          aria-label={showAdminPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showAdminPassword ? "Ocultar" : "Mostrar"}
                        </button>
                      </div>
                      <small id="admin-password-help">A senha é verificada apenas no servidor.</small>
                      {adminError ? <p id="admin-error" className="admin-error" role="alert">{adminError}</p> : null}
                      <button className="button button-red" type="submit" disabled={adminSubmitting}>
                        {adminSubmitting ? "Verificando…" : "Desbloquear painel →"}
                      </button>
                    </form>
                  </div>
                  <aside className="admin-guardrails">
                    <p>COMO ESTE ACESSO É PROTEGIDO</p>
                    <div><span>01</span><p><strong>Só na sua conta</strong><small>O botão nem aparece para outros usuários.</small></p></div>
                    <div><span>02</span><p><strong>Senha fora do código</strong><small>O hash da credencial fica protegido no ambiente do servidor.</small></p></div>
                    <div><span>03</span><p><strong>Expira sozinho</strong><small>O acesso elevado é encerrado após 15 minutos.</small></p></div>
                  </aside>
                </div>
              )}
            </section>
          ) : loadError ? (
            <div className="load-error" role="alert">
              <span>!</span>
              <div><strong>Seu espaço não carregou.</strong><p>{loadError}</p></div>
              <button type="button" onClick={() => void loadData()}>Tentar novamente</button>
            </div>
          ) : loading ? (
            <DashboardSkeleton />
          ) : activeView === "overview" ? (
            <div className="overview-layout">
              <section className="focus-card">
                <div className="focus-card-head">
                  <span>AGORA</span>
                  <small>{openTasks.length} EM ABERTO</small>
                </div>
                {focusTask ? (
                  <>
                    <p>FOCO SUGERIDO</p>
                    <h2>{focusTask.title}</h2>
                    <div className="focus-meta">
                      <span>{formatTaskDate(focusTask.dueAt, now)}</span>
                      <span>{priorityLabels[focusTask.priority]}</span>
                    </div>
                    {focusTask.description ? <blockquote>{focusTask.description}</blockquote> : null}
                    <div className="focus-actions">
                      <button type="button" onClick={() => void toggleTask(focusTask)}>✓ Marcar como concluída</button>
                      <button type="button" onClick={() => selectView("tasks")}>Ver tarefas →</button>
                    </div>
                  </>
                ) : (
                  <div className="focus-empty">
                    <span>✓</span>
                    <h2>Mente leve, lista limpa.</h2>
                    <p>Quando surgir algo, guarde aqui antes que escape.</p>
                    <button type="button" onClick={() => openModal("task")}>+ Criar uma tarefa</button>
                  </div>
                )}
                <div className="focus-watermark" aria-hidden="true">T</div>
              </section>

              <section className="progress-card">
                <div>
                  <p>SEU RITMO</p>
                  <strong>{progress}%</strong>
                  <span>das tarefas concluídas</span>
                </div>
                <div
                  className="progress-ring"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  style={{ "--progress": progress + "%" } as CSSProperties}
                >
                  <span>{completedTasks.length}<small>feitas</small></span>
                </div>
              </section>

              <section className="dashboard-panel next-panel">
                <div className="panel-head">
                  <div><p>PRÓXIMOS PASSOS</p><h2>Para cuidar hoje</h2></div>
                  <button type="button" onClick={() => selectView("tasks")}>Ver todas →</button>
                </div>
                <div className="task-list">
                  {todayTasks.length
                    ? todayTasks.map((task) => renderTask(task, true))
                    : <EmptyState kind="task" onAdd={openModal} />}
                </div>
              </section>

              <section className="dashboard-panel timeline-panel">
                <div className="panel-head">
                  <div><p>MAPA DO DIA</p><h2>Próximos compromissos</h2></div>
                  <button type="button" onClick={() => selectView("agenda")}>Abrir agenda →</button>
                </div>
                {upcomingEvents.length ? (
                  <ol className="mini-event-list">
                    {upcomingEvents.slice(0, 4).map((event) => (
                      <li key={event.id}>
                        <time>{timeFormatter.format(new Date(event.startsAt))}</time>
                        <i aria-hidden="true" />
                        <span><strong>{event.title}</strong><small>{event.location || formatEventDate(event.startsAt, now)}</small></span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState kind="event" onAdd={openModal} />
                )}
              </section>

              <section className="dashboard-panel notes-preview">
                <div className="panel-head">
                  <div><p>IDEIAS GUARDADAS</p><h2>Notas recentes</h2></div>
                  <button type="button" onClick={() => selectView("notes")}>Ver notas →</button>
                </div>
                {data.notes.length ? (
                  <div className="notes-preview-grid">{data.notes.slice(0, 3).map(renderNote)}</div>
                ) : (
                  <EmptyState kind="note" onAdd={openModal} />
                )}
              </section>
            </div>
          ) : activeView === "tasks" ? (
            <section className="collection-view">
              <div className="collection-head">
                <div><p>LISTA DE AÇÃO</p><h2>Suas tarefas</h2></div>
                <button className="button button-red" type="button" onClick={() => openModal("task")}>+ Nova tarefa</button>
              </div>
              <div className="filter-chips" aria-label="Filtrar tarefas">
                {([
                  ["open", "Em aberto"],
                  ["all", "Todas"],
                  ["done", "Concluídas"],
                ] as const).map(([id, label]) => (
                  <button
                    type="button"
                    className={taskFilter === id ? "active" : ""}
                    aria-pressed={taskFilter === id}
                    onClick={() => setTaskFilter(id)}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="collection-list">
                {filteredTasks.length
                  ? filteredTasks.map((task) => renderTask(task))
                  : <EmptyState kind="task" onAdd={openModal} />}
              </div>
            </section>
          ) : activeView === "notes" ? (
            <section className="collection-view">
              <div className="collection-head">
                <div><p>SEGUNDO CÉREBRO</p><h2>Suas notas</h2></div>
                <button className="button button-red" type="button" onClick={() => openModal("note")}>+ Nova nota</button>
              </div>
              {filteredNotes.length ? (
                <div className="notes-grid">{filteredNotes.map(renderNote)}</div>
              ) : (
                <EmptyState kind="note" onAdd={openModal} />
              )}
            </section>
          ) : (
            <section className="collection-view">
              <div className="collection-head">
                <div><p>SEU TEMPO</p><h2>Agenda</h2></div>
                <button className="button button-red" type="button" onClick={() => openModal("event")}>+ Novo compromisso</button>
              </div>
              {filteredEvents.length ? (
                <ol className="event-list">{filteredEvents.map(renderEvent)}</ol>
              ) : (
                <EmptyState kind="event" onAdd={openModal} />
              )}
            </section>
          )}
        </div>
      </main>

      <aside className="context-panel">
        {activeView === "admin" && adminEligible ? (
          <>
            <div className="context-head admin-context-head">
              <p>MODO PROPRIETÁRIO</p>
              <h2>Controle sem invadir.</h2>
              <span>O painel mostra totais e sinais de segurança, nunca o conteúdo pessoal das contas.</span>
            </div>
            <div className="context-block">
              <div className="context-title"><span>CAMADAS ATIVAS</span></div>
              <div className="admin-context-layers">
                <div><i>1</i><span><strong>Conta autenticada</strong><small>Sign in with ChatGPT</small></span></div>
                <div><i>2</i><span><strong>Senha administrativa</strong><small>Hash protegido no servidor</small></span></div>
                <div><i>3</i><span><strong>Sessão assinada</strong><small>Expiração automática</small></span></div>
              </div>
            </div>
            <div className="context-sync"><span>●</span><p><strong>Visão somente leitura</strong><small>Nenhuma ação destrutiva neste painel.</small></p></div>
          </>
        ) : (
          <>
            <div className="context-head">
              <p>CAPTURA RÁPIDA</p>
              <h2>O que você quer guardar?</h2>
              <button type="button" onClick={() => openModal("task")}>
                Escreva uma ideia, tarefa ou compromisso…
              </button>
              <div>
                <button type="button" onClick={() => openModal("task")}>✓ Tarefa</button>
                <button type="button" onClick={() => openModal("note")}>□ Nota</button>
                <button type="button" onClick={() => openModal("event")}>◷ Evento</button>
              </div>
            </div>
            <div className="context-block">
              <div className="context-title"><span>HOJE</span><b>{todayTasks.length}</b></div>
              {todayTasks.slice(0, 3).map((task) => (
                <button className="context-task" type="button" onClick={() => selectView("tasks")} key={task.id}>
                  <i className={"priority-dot " + task.priority} />
                  <span><strong>{task.title}</strong><small>{formatTaskDate(task.dueAt, now)}</small></span>
                </button>
              ))}
              {!todayTasks.length ? <p className="context-empty">Sem pendências para hoje.</p> : null}
            </div>
            <div className="context-block">
              <div className="context-title"><span>VISÃO GERAL</span></div>
              <div className="context-stats">
                <div><strong>{openTasks.length}</strong><span>tarefas abertas</span></div>
                <div><strong>{data.notes.length}</strong><span>notas guardadas</span></div>
                <div><strong>{upcomingEvents.length}</strong><span>eventos futuros</span></div>
              </div>
            </div>
            <div className="context-sync"><span>●</span><p><strong>Tudo sincronizado</strong><small>Seu espaço está salvo e protegido.</small></p></div>
          </>
        )}
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        {navItems.slice(0, 2).map((item) => (
          <button type="button" onClick={() => selectView(item.id)} className={activeView === item.id ? "active" : ""} key={item.id}>
            <span>{item.glyph}</span>{item.label}
          </button>
        ))}
        <button className="mobile-plus" type="button" onClick={() => openModal("task")} aria-label="Guardar algo">＋</button>
        {navItems.slice(2).map((item) => (
          <button type="button" onClick={() => selectView(item.id)} className={activeView === item.id ? "active" : ""} key={item.id}>
            <span>{item.glyph}</span>{item.label}
          </button>
        ))}
      </nav>

      {modalKind ? (
        <div className="modal-backdrop">
          <div
            className="capture-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
            ref={dialogRef}
          >
            <div className="modal-head">
              <div><p>GUARDAR NO THEUS</p><h2 id="capture-title">Tire isso da cabeça.</h2></div>
              <button type="button" onClick={closeModal} aria-label="Fechar">×</button>
            </div>
            <div className="type-picker" aria-label="Tipo de item">
              {(["task", "note", "event"] as OrganizerKind[]).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={modalKind === kind ? "active" : ""}
                  aria-pressed={modalKind === kind}
                  onClick={() => {
                    setModalKind(kind);
                    setFormError("");
                  }}
                >
                  <span>{kind === "task" ? "✓" : kind === "note" ? "□" : "◷"}</span>
                  {typeLabels[kind]}
                </button>
              ))}
            </div>
            <form onSubmit={handleCreate}>
              <label>
                <span>Título</span>
                <input
                  name="title"
                  ref={titleInputRef}
                  maxLength={180}
                  placeholder={
                    modalKind === "task"
                      ? "O que precisa ser feito?"
                      : modalKind === "note"
                        ? "Como você vai encontrar esta nota?"
                        : "Qual é o compromisso?"
                  }
                  aria-describedby={formError ? "form-error" : undefined}
                />
              </label>

              {modalKind === "note" ? (
                <>
                  <label>
                    <span>Conteúdo</span>
                    <textarea name="content" maxLength={20000} rows={6} placeholder="Escreva livremente…" />
                  </label>
                  <label className="check-field">
                    <input type="checkbox" name="pinned" />
                    <span>Fixar esta nota no topo</span>
                  </label>
                </>
              ) : (
                <label>
                  <span>Detalhes <small>opcional</small></span>
                  <textarea name="description" maxLength={4000} rows={3} placeholder="Adicione contexto, se quiser." />
                </label>
              )}

              {modalKind === "task" ? (
                <div className="form-row">
                  <label>
                    <span>Prazo</span>
                    <input type="datetime-local" name="dueAt" />
                  </label>
                  <label>
                    <span>Prioridade</span>
                    <select name="priority" defaultValue="medium">
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {modalKind === "event" ? (
                <>
                  <label>
                    <span>Local <small>opcional</small></span>
                    <input name="location" maxLength={300} placeholder="Onde vai acontecer?" />
                  </label>
                  <div className="form-row">
                    <label>
                      <span>Começa</span>
                      <input type="datetime-local" name="startsAt" required />
                    </label>
                    <label>
                      <span>Termina <small>opcional</small></span>
                      <input type="datetime-local" name="endsAt" />
                    </label>
                  </div>
                  <label className="check-field">
                    <input type="checkbox" name="allDay" />
                    <span>Ocupa o dia todo</span>
                  </label>
                </>
              ) : null}

              {formError ? <p className="form-error" id="form-error" role="alert">{formError}</p> : null}
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancelar</button>
                <button className="button button-red" type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar " + typeLabels[modalKind].toLocaleLowerCase("pt-BR")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className={"toast " + (toast ? "show" : "")} role="status" aria-live="polite">
        <span>✓</span>{toast}
      </div>
    </div>
  );
}
