import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { JournalError } from "@money-tracker/core";
import {
  hashPassword,
  newDekSalt,
  type UserRecord,
  type UsersIndex,
  verifyPassword,
} from "./crypto.js";

export class UserVault {
  constructor(private readonly dataDir: string) {}

  private indexPath(): string {
    return path.join(this.dataDir, "users.json");
  }

  encPath(userId: string): string {
    return path.join(this.dataDir, `user-${userId}.db.enc`);
  }

  sessionPath(userId: string): string {
    return path.join(this.dataDir, ".session", `user-${userId}.db`);
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(path.join(this.dataDir, ".session"), { recursive: true });
  }

  async loadIndex(): Promise<UsersIndex> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.indexPath(), "utf8");
      return JSON.parse(raw) as UsersIndex;
    } catch {
      return { version: 1, users: [] };
    }
  }

  async saveIndex(index: UsersIndex): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.indexPath(), JSON.stringify(index, null, 2), "utf8");
  }

  async listUsers(): Promise<Array<{ id: string; username: string; createdAt: string }>> {
    const index = await this.loadIndex();
    return index.users
      .map((u) => ({ id: u.id, username: u.username, createdAt: u.createdAt }))
      .sort((a, b) => a.username.localeCompare(b.username, "ru"));
  }

  async createUser(username: string, password: string): Promise<UserRecord> {
    const cleaned = username.trim();
    if (!cleaned) throw new JournalError("Укажите имя пользователя");
    if (cleaned.length > 64) throw new JournalError("Имя пользователя слишком длинное");
    if (!password || password.length < 4) {
      throw new JournalError("Пароль: минимум 4 символа");
    }
    const index = await this.loadIndex();
    if (index.users.some((u) => u.username.toLowerCase() === cleaned.toLowerCase())) {
      throw new JournalError("Пользователь с таким именем уже есть");
    }
    const user: UserRecord = {
      id: randomUUID(),
      username: cleaned,
      passwordHash: await hashPassword(password),
      dekSalt: newDekSalt(),
      createdAt: new Date().toISOString(),
    };
    index.users.push(user);
    await this.saveIndex(index);
    return user;
  }

  async findUser(username: string): Promise<UserRecord | null> {
    const index = await this.loadIndex();
    return (
      index.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase()) ?? null
    );
  }

  async findById(id: string): Promise<UserRecord | null> {
    const index = await this.loadIndex();
    return index.users.find((u) => u.id === id) ?? null;
  }

  async authenticate(username: string, password: string): Promise<UserRecord> {
    const user = await this.findUser(username);
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      throw new JournalError("Неверный логин или пароль");
    }
    return user;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<UserRecord> {
    if (!newPassword || newPassword.length < 4) {
      throw new JournalError("Пароль: минимум 4 символа");
    }
    const index = await this.loadIndex();
    const user = index.users.find((u) => u.id === userId);
    if (!user || !(await verifyPassword(user.passwordHash, oldPassword))) {
      throw new JournalError("Неверный текущий пароль");
    }
    user.passwordHash = await hashPassword(newPassword);
    // keep same dekSalt — caller re-encrypts DB with new password-derived DEK... 
    // Actually DEK is derived from password+salt, so changing password changes DEK.
    // Caller must decrypt with old password and re-encrypt with new.
    await this.saveIndex(index);
    return user;
  }

  async rotateDekSalt(userId: string): Promise<UserRecord> {
    const index = await this.loadIndex();
    const user = index.users.find((u) => u.id === userId);
    if (!user) throw new JournalError("Пользователь не найден");
    user.dekSalt = newDekSalt();
    await this.saveIndex(index);
    return user;
  }
}