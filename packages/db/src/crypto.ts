import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export interface UserRecord {
  id: string;
  username: string;
  /** scrypt password verifier: scrypt$N$r$p$saltHex$hashHex */
  passwordHash: string;
  /** salt for DEK derivation (hex) */
  dekSalt: string;
  createdAt: string;
}

export interface UsersIndex {
  version: 1;
  users: UserRecord[];
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_LEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, HASH_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4]!, "hex");
    const expected = Buffer.from(parts[5]!, "hex");
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function newDekSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Derive 32-byte AES key from password + salt. */
export function deriveDek(password: string, dekSaltHex: string): Buffer {
  const salt = Buffer.from(dekSaltHex, "hex");
  return scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

export function encryptDb(plain: Buffer, dek: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: magic(4) | iv(12) | tag(16) | ciphertext
  return Buffer.concat([Buffer.from("MTDB"), iv, tag, encrypted]);
}

export function decryptDb(blob: Buffer, dek: Buffer): Buffer {
  if (blob.length < 4 + 12 + 16 || blob.subarray(0, 4).toString() !== "MTDB") {
    throw new Error("Повреждённый файл базы");
  }
  const iv = blob.subarray(4, 16);
  const tag = blob.subarray(16, 32);
  const data = blob.subarray(32);
  const decipher = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Encrypt backup payload JSON bytes with password-derived key → MTBAK2 file. */
export function encryptBackupV2(jsonBytes: Uint8Array, password: string): Buffer {
  const salt = randomBytes(16);
  const dek = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(jsonBytes)), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
  return Buffer.from(`MTBAK2\n${body}`, "utf8");
}

export function decryptBackupV2(fileBytes: Buffer, password: string): Uint8Array {
  const text = fileBytes.toString("utf8").trim();
  const newline = text.indexOf("\n");
  if (newline < 0 || text.slice(0, newline).trim() !== "MTBAK2") {
    throw new Error("Неверный формат бекапа");
  }
  const body = text.slice(newline + 1).replace(/\s+/g, "");
  const bin = Buffer.from(body, "base64");
  if (bin.length < 16 + 12 + 16) throw new Error("Не удалось прочитать бекап");
  const salt = bin.subarray(0, 16);
  const iv = bin.subarray(16, 28);
  const tag = bin.subarray(28, 44);
  const data = bin.subarray(44);
  const dek = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const decipher = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  try {
    return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]));
  } catch {
    throw new Error("Неверный пароль или повреждённый бекап");
  }
}

export function secureWipe(buf: Buffer): void {
  buf.fill(0);
}

export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
