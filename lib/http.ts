import { getChatGPTUser } from "../app/chatgpt-auth";

const MAX_BODY_BYTES = 64 * 1024;

export async function getApiUser() {
  return getChatGPTUser();
}

export function isTrustedMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return null;
  }

  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return null;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export function apiJson(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function isStrictSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isShortText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return (allowEmpty || text.length > 0) && text.length <= maxLength;
}

export function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
