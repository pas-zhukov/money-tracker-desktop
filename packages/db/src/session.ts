import { promises as fs } from "node:fs";
import { JournalError, backupHeader, decodeLegacyBackup, decodeV2ClearPayload, encodeV2ClearPayload } from "@money-tracker/core";
import {
  decryptBackupV2,
  decryptDb,
  deriveDek,
  encryptBackupV2,
  encryptDb,
  secureWipe,
  type UserRecord,
} from "./crypto.js";
import { MoneyStore } from "./store.js";
import { UserVault } from "./users.js";

export class SessionManager {
  private store: MoneyStore | null = null;
  private user: UserRecord | null = null;
  private password: string | null = null;
  private dek: Buffer | null = null;

  constructor(private readonly vault: UserVault) {}

  get currentUser(): { id: string; username: string } | null {
    return this.user ? { id: this.user.id, username: this.user.username } : null;
  }

  get money(): MoneyStore {
    if (!this.store) throw new JournalError("Сначала войдите в аккаунт");
    return this.store;
  }

  async listUsers() {
    return this.vault.listUsers();
  }

  async createAccount(username: string, password: string): Promise<void> {
    const user = await this.vault.createUser(username, password);
    const dek = deriveDek(password, user.dekSalt);
    const sessionPath = this.vault.sessionPath(user.id);
    await this.vault.ensureDir();
    // create empty encrypted db
    const store = MoneyStore.open(sessionPath);
    store.close();
    const plain = await fs.readFile(sessionPath);
    const enc = encryptDb(plain, dek);
    await fs.writeFile(this.vault.encPath(user.id), enc);
    await fs.rm(sessionPath, { force: true });
    secureWipe(dek);
    // auto login
    await this.login(username, password);
  }

  async login(username: string, password: string): Promise<void> {
    await this.logout();
    const user = await this.vault.authenticate(username, password);
    const dek = deriveDek(password, user.dekSalt);
    const encPath = this.vault.encPath(user.id);
    const sessionPath = this.vault.sessionPath(user.id);
    await this.vault.ensureDir();
    try {
      const blob = await fs.readFile(encPath);
      const plain = decryptDb(blob, dek);
      await fs.writeFile(sessionPath, plain);
      secureWipe(plain);
    } catch (e) {
      // first login after createAccount should have file; if missing create empty
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        const store = MoneyStore.open(sessionPath);
        store.close();
        const plain = await fs.readFile(sessionPath);
        await fs.writeFile(encPath, encryptDb(plain, dek));
      } else {
        secureWipe(dek);
        throw new JournalError("Не удалось открыть базу (неверный пароль?)");
      }
    }
    this.store = MoneyStore.open(sessionPath);
    this.user = user;
    this.password = password;
    this.dek = dek;
  }

  async persist(): Promise<void> {
    if (!this.user || !this.dek || !this.store) return;
    this.store.close();
    const sessionPath = this.vault.sessionPath(this.user.id);
    const plain = await fs.readFile(sessionPath);
    await fs.writeFile(this.vault.encPath(this.user.id), encryptDb(plain, this.dek));
    secureWipe(plain);
    this.store = MoneyStore.open(sessionPath);
  }

  async logout(): Promise<void> {
    if (this.store && this.user && this.dek) {
      try {
        this.store.close();
      } catch {
        /* ignore */
      }
      const sessionPath = this.vault.sessionPath(this.user.id);
      try {
        const plain = await fs.readFile(sessionPath);
        await fs.writeFile(this.vault.encPath(this.user.id), encryptDb(plain, this.dek));
        secureWipe(plain);
        await fs.rm(sessionPath, { force: true });
      } catch {
        /* ignore */
      }
    } else if (this.store) {
      try {
        this.store.close();
      } catch {
        /* ignore */
      }
    }
    if (this.dek) secureWipe(this.dek);
    this.store = null;
    this.user = null;
    this.password = null;
    this.dek = null;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this.user || !this.password || !this.store) {
      throw new JournalError("Сначала войдите в аккаунт");
    }
    if (oldPassword !== this.password) {
      throw new JournalError("Неверный текущий пароль");
    }
    await this.persist();
    const updated = await this.vault.changePassword(this.user.id, oldPassword, newPassword);
    // re-derive with same salt — wait, changePassword keeps salt, so DEK changes with password
    const newDek = deriveDek(newPassword, updated.dekSalt);
    const sessionPath = this.vault.sessionPath(this.user.id);
    this.store.close();
    const plain = await fs.readFile(sessionPath);
    await fs.writeFile(this.vault.encPath(this.user.id), encryptDb(plain, newDek));
    secureWipe(plain);
    if (this.dek) secureWipe(this.dek);
    this.dek = newDek;
    this.password = newPassword;
    this.user = updated;
    this.store = MoneyStore.open(sessionPath);
  }

  async exportBackupV2(): Promise<Buffer> {
    if (!this.password) throw new JournalError("Сначала войдите в аккаунт");
    await this.persist();
    const payload = this.money.exportPayload();
    const json = encodeV2ClearPayload(payload);
    return encryptBackupV2(json, this.password);
  }

  async importBackupFile(fileBytes: Buffer, passwordForV2?: string): Promise<void> {
    const header = backupHeader(new Uint8Array(fileBytes));
    let payload;
    if (header === "MTBAK1") {
      payload = decodeLegacyBackup(new Uint8Array(fileBytes));
    } else if (header === "MTBAK2") {
      const pwd = passwordForV2 || this.password;
      if (!pwd) throw new JournalError("Укажите пароль бекапа");
      const json = decryptBackupV2(fileBytes, pwd);
      payload = decodeV2ClearPayload(json);
    } else {
      throw new JournalError("Неверный формат бекапа");
    }
    this.money.importPayload(payload);
    await this.persist();
  }

  backupFilename(): string {
    const day = new Date().toISOString().slice(0, 10);
    return `money-tracker-backup-${day}.mtbak`;
  }
}