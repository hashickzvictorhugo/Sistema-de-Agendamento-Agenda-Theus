import { env } from "cloudflare:workers";
import { isAdminSessionActive } from "../db/admin";

const COOKIE_NAME = "__Host-theus_admin";
const SESSION_AUDIENCE = "theus-admin-v1";
const SESSION_MAX_AGE_SECONDS = 15 * 60;
const MAX_PASSWORD_LENGTH = 512;

type AdminSessionPayload = {
  sub: string;
  iat: number;
  exp: number;
  aud: typeof SESSION_AUDIENCE;
  nonce: string;
};

type PasswordHash = {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
};

type AdminIdentity = { userId: string };

export function isConfiguredAdmin(user: AdminIdentity): boolean {
  const ownerUserId = env.ADMIN_OWNER_USER_ID?.trim();
  return Boolean(
    ownerUserId &&
      env.ADMIN_PASSWORD_HASH &&
      getSessionSecret() &&
      user.userId === ownerUserId,
  );
}

export async function verifyAdminPassword(input: unknown): Promise<boolean> {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > MAX_PASSWORD_LENGTH
  ) {
    return false;
  }

  const parsed = parsePasswordHash(env.ADMIN_PASSWORD_HASH);
  if (!parsed) return false;

  try {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(input),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: toArrayBuffer(parsed.salt),
          iterations: parsed.iterations,
        },
        passwordKey,
        parsed.hash.byteLength * 8,
      ),
    );
    return fixedLengthEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

export async function createAdminSession(userId: string): Promise<{
  token: string;
  expiresAt: number;
  nonce: string;
}> {
  const secret = getSessionSecret();
  if (!secret || !userId) throw new Error("Admin access is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: userId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    aud: SESSION_AUDIENCE,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await sign(encodedPayload, secret);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: payload.exp,
    nonce: payload.nonce,
  };
}

export async function verifyAdminSession(
  request: Request,
  userId: string,
): Promise<AdminSessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !userId) return null;

  const token = readSingleCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const expectedSignature = await sign(parts[0], secret);
    const supplied = base64UrlDecode(parts[1]);
    const expected = base64UrlDecode(expectedSignature);
    if (!supplied || !expected || !fixedLengthEqual(supplied, expected)) {
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[0]) ?? new Uint8Array()),
    ) as Partial<AdminSessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.aud !== SESSION_AUDIENCE ||
      payload.sub !== userId ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.nonce !== "string" ||
      payload.iat > now + 30 ||
      payload.exp <= now ||
      payload.exp - payload.iat !== SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    const session = payload as AdminSessionPayload;
    if (!(await isAdminSessionActive(userId, session.nonce, now))) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function getSessionSecret(): string | null {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret).byteLength >= 32 ? secret : null;
}

export function adminSessionCookie(token: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearAdminSessionCookie(): string {
  return adminSessionCookie("", 0);
}

function parsePasswordHash(value: string | undefined): PasswordHash | null {
  if (!value) return null;
  const [algorithm, iterationsText, saltText, hashText, extra] = value.split("$");
  const iterations = Number(iterationsText);
  const salt = base64UrlDecode(saltText);
  const hash = base64UrlDecode(hashText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    extra !== undefined ||
    !Number.isInteger(iterations) ||
    iterations < 600_000 ||
    iterations > 1_000_000 ||
    !salt ||
    salt.byteLength < 16 ||
    !hash ||
    hash.byteLength !== 32
  ) {
    return null;
  }
  return { iterations, salt, hash };
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function fixedLengthEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index] ^ second[index];
  }
  return difference === 0;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function readSingleCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return value || null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string | undefined): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(value.length / 4) * 4,
      "=",
    );
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
