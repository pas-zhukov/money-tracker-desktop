import { useEffect, useState } from "react";
import { api } from "../api";

export function SettingsPage() {
  const [salaryDay, setSalaryDay] = useState(6);
  const [advanceDay, setAdvanceDay] = useState(21);
  const [includeAdvance, setIncludeAdvance] = useState(false);
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDay, setReminderDay] = useState(1);
  const [reminderHour, setReminderHour] = useState(10);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [autostart, setAutostart] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api()
      .settings.get()
      .then((data) => {
        const d = data as {
          payroll: { salaryDay: number; advanceDay: number; includeAdvance: boolean };
          app: {
            timezone: string;
            reminderEnabled: boolean;
            reminderDay: number;
            reminderHour: number;
            reminderMinute: number;
            autostart: boolean;
            trayEnabled: boolean;
          };
        };
        setSalaryDay(d.payroll.salaryDay);
        setAdvanceDay(d.payroll.advanceDay);
        setIncludeAdvance(d.payroll.includeAdvance);
        setTimezone(d.app.timezone);
        setReminderEnabled(d.app.reminderEnabled);
        setReminderDay(d.app.reminderDay);
        setReminderHour(d.app.reminderHour);
        setReminderMinute(d.app.reminderMinute);
        setAutostart(d.app.autostart);
        setTrayEnabled(d.app.trayEnabled);
      })
      .catch((e) => setError(e.message));
  }, []);

  const savePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().settings.payroll(salaryDay, advanceDay, includeAdvance);
      setMsg("Настройки выплат сохранены");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().settings.app({
        timezone,
        reminderEnabled,
        reminderDay,
        reminderHour,
        reminderMinute,
        autostart,
        trayEnabled,
      });
      setMsg("Настройки уведомлений сохранены");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().users.changePassword(oldP, newP);
      setOldP("");
      setNewP("");
      setMsg("Пароль изменён, база перешифрована");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <h1 className="page-title">Настройки</h1>
      <p className="page-sub">Выплаты, напоминания и безопасность</p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="panel ok">{msg}</div>}

      <div className="panel">
        <strong>Расчётный период</strong>
        <form className="row" style={{ marginTop: 12 }} onSubmit={savePayroll}>
          <label className="field">
            День зарплаты
            <input
              type="number"
              min={1}
              max={31}
              value={salaryDay}
              onChange={(e) => setSalaryDay(Number(e.target.value))}
            />
          </label>
          <label className="field">
            День аванса
            <input
              type="number"
              min={1}
              max={31}
              value={advanceDay}
              onChange={(e) => setAdvanceDay(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Режим
            <select
              value={includeAdvance ? "both" : "salary"}
              onChange={(e) => setIncludeAdvance(e.target.value === "both")}
            >
              <option value="salary">Только зарплата</option>
              <option value="both">Зарплата и аванс</option>
            </select>
          </label>
          <button className="btn primary" type="submit">
            Сохранить
          </button>
        </form>
      </div>

      <div className="panel">
        <strong>Уведомления Windows</strong>
        <form className="stack" style={{ marginTop: 12 }} onSubmit={saveApp}>
          <label className="field">
            Часовой пояс
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />{" "}
              Напоминать зафиксировать остатки
            </span>
          </label>
          <div className="row">
            <label className="field">
              День месяца
              <input
                type="number"
                min={1}
                max={31}
                value={reminderDay}
                onChange={(e) => setReminderDay(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Час
              <input
                type="number"
                min={0}
                max={23}
                value={reminderHour}
                onChange={(e) => setReminderHour(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Минута
              <input
                type="number"
                min={0}
                max={59}
                value={reminderMinute}
                onChange={(e) => setReminderMinute(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
              />{" "}
              Автозапуск Windows
            </span>
          </label>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={trayEnabled}
                onChange={(e) => setTrayEnabled(e.target.checked)}
              />{" "}
              Иконка в трее
            </span>
          </label>
          <button className="btn primary" type="submit">
            Сохранить уведомления
          </button>
        </form>
      </div>

      <div className="panel">
        <strong>Смена пароля</strong>
        <form className="stack" style={{ marginTop: 12 }} onSubmit={changePassword}>
          <label className="field">
            Текущий пароль
            <input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} required />
          </label>
          <label className="field">
            Новый пароль
            <input
              type="password"
              value={newP}
              onChange={(e) => setNewP(e.target.value)}
              required
              minLength={4}
            />
          </label>
          <button className="btn primary" type="submit">
            Сменить пароль
          </button>
        </form>
      </div>
    </div>
  );
}