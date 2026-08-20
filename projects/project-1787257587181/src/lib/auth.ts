import { getSession } from "./session";
import { SessionPayload } from "./session";

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const match = hex.match(/.{1,2}/g);
  if (!match) return new Uint8Array(0);
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();

  const importedKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    importedKey,
    KEY_LENGTH * 8
  );

  const hashArray = new Uint8Array(derivedBits);
  return `${bufferToHex(salt)}:${bufferToHex(hashArray)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;

    const [saltHex, originalHashHex] = parts;
    const salt = hexToBuffer(saltHex);
    const encoder = new TextEncoder();

    const importedKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      importedKey,
      KEY_LENGTH * 8
    );

    const derivedHashHex = bufferToHex(new Uint8Array(derivedBits));
    return derivedHashHex === originalHashHex;
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  return await getSession();
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function checkAuthorization(
  allowedRoles: string[] = ["ADMIN"]
): Promise<{ authorized: boolean; session: SessionPayload | null }> {
  const session = await getSession();
  if (!session) {
    return { authorized: false, session: null };
  }
  const isAllowed = allowedRoles.includes(session.role);
  return { authorized: isAllowed, session };
}
