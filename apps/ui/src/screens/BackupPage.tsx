import { useState } from "react";
import { api } from "../api";

export function BackupPage() {
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportBak = async () => {
    try {
      const path = await api().backup.export();
      setMsg(`Бекап сохранён: ${path}`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const importBak = async () => {
    if (!confirm) {
      setError("Подтвердите полную замену данных");
      return;
    }
    try {
      await api().backup.import(password || undefined);
      setMsg("Данные восстановлены из бекапа");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h1 className="page-title">Бекап</h1>
      <p className="page-sub">
        Зашифрованный бекап (MTBAK2) и импорт старых файлов MTBAK1 из серверного журнала
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="panel ok">{msg}</div>}

      <div className="panel stack">
        <strong>Экспорт</strong>
        <p className="muted">
          Файл `.mtbak` шифруется паролем текущего пользователя (AES-256-GCM).
        </p>
        <button className="btn primary" type="button" onClick={exportBak}>
          Скачать бекап
        </button>
      </div>

      <div className="panel stack">
        <strong>Импорт / восстановление</strong>
        <p className="muted">
          Поддерживаются MTBAK2 (нужен пароль, если бекап чужой) и старый формат MTBAK1 без пароля.
          Текущие данные будут полностью заменены.
        </p>
        <label className="field">
          Пароль для MTBAK2 (необязательно для MTBAK1 / своего бекапа)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            Подтверждаю полную замену данных
          </span>
        </label>
        <button className="btn danger" type="button" onClick={importBak}>
          Выбрать файл и восстановить
        </button>
      </div>
    </div>
  );
}