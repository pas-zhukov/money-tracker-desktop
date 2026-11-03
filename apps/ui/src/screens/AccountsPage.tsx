import { useEffect, useState } from "react";
import { api, formatMoney } from "../api";

type Snap = { id: string; recordedOn: string; amount: string };
type Acc = {
  id: string;
  name: string;
  openedOn: string;
  archived: boolean;
  lastAmount: string | null;
  lastRecordedOn: string | null;
  snapshots: Snap[];
};

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const list = (await api().balances.list()) as Acc[];
    setAccounts(list);
    if (!selected && list[0]) setSelected(list[0].id);
    if (!date) setDate(String(await api().periods.today()));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const current = accounts.find((a) => a.id === selected) ?? null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().balances.create(name);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api().balances.record(selected, date, amount);
      setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const trend = current?.snapshots ?? [];
  const max = Math.max(1, ...trend.map((s) => Number(s.amount)));

  return (
    <div>
      <h1 className="page-title">Состояние счетов</h1>
      <p className="page-sub">Фиксация фактических остатков (напоминание приходит в центр уведомлений Windows)</p>
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <form className="row" onSubmit={create}>
          <label className="field">
            Новый счёт
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button className="btn primary" type="submit">
            Создать
          </button>
        </form>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Счёт</th>
              <th>Остаток</th>
              <th>Дата</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} style={{ opacity: a.archived ? 0.55 : 1 }}>
                <td>
                  <button className="btn ghost" type="button" onClick={() => setSelected(a.id)}>
                    {a.name}
                  </button>
                </td>
                <td>{a.lastAmount ? formatMoney(a.lastAmount) : "—"}</td>
                <td>{a.lastRecordedOn || "—"}</td>
                <td className="row">
                  {a.archived ? (
                    <button className="btn" type="button" onClick={() => api().balances.restore(a.id).then(load)}>
                      Вернуть
                    </button>
                  ) : (
                    <button className="btn" type="button" onClick={() => api().balances.archive(a.id).then(load)}>
                      В архив
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current && !current.archived && (
        <div className="panel">
          <strong>{current.name}</strong>
          <form className="row" style={{ marginTop: 12 }} onSubmit={record}>
            <label className="field">
              Дата
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="field">
              Остаток
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <button className="btn primary" type="submit">
              Зафиксировать
            </button>
          </form>

          {trend.length >= 2 && (
            <svg className="chart" viewBox="0 0 640 180" style={{ marginTop: 16 }}>
              <polyline
                fill="none"
                stroke="#3d8bfd"
                strokeWidth="2.5"
                points={trend
                  .map((s, i) => {
                    const x = 20 + (i * 600) / Math.max(trend.length - 1, 1);
                    const y = 160 - (Number(s.amount) / max) * 140;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
          )}

          <table className="data" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...trend].reverse().map((s) => (
                <tr key={s.id}>
                  <td>{s.recordedOn}</td>
                  <td>{formatMoney(s.amount)}</td>
                  <td>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => api().balances.deleteSnapshot(s.id).then(load)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}