import { useEffect, useState } from "react";
import { api } from "../api";

type UserInfo = { id: string; username: string; createdAt?: string };

export function AuthPage({
  onLoggedIn,
}: {
  onLoggedIn: (u: { id: string; username: string }) => void;
}) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [mode, setMode] = useState<"login" | "create">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const list = (await api().users.list()) as UserInfo[];
    setUsers(list);
    if (list.length === 0) setMode("create");
  };

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message || e)));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "create") {
        if (password !== password2) throw new Error("Пароли не совпадают");
        const created = (await api().users.create(username, password)) as {
          id: string;
          username: string;
        };
        onLoggedIn(created);
      } else {
        const u = (await api().users.login(username, password)) as {
          id: string;
          username: string;
        };
        onLoggedIn(u);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Money Tracker</h1>
        <p>Локальный журнал финансов. Данные шифруются паролем аккаунта.</p>

        {users.length > 0 && mode === "login" && (
          <div className="user-list">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                className="btn"
                onClick={() => setUsername(u.username)}
              >
                {u.username}
              </button>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <form className="stack" onSubmit={submit}>
          <label className="field">
            Логин
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="field">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </label>
          {mode === "create" && (
            <label className="field">
              Повтор пароля
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={4}
              />
            </label>
          )}
          <button className="btn primary" disabled={busy} type="submit">
            {mode === "create" ? "Создать аккаунт" : "Войти"}
          </button>
        </form>

        <div className="row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMode(mode === "login" ? "create" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Создать новый аккаунт" : "Уже есть аккаунт — войти"}
          </button>
        </div>
      </div>
    </div>
  );
}