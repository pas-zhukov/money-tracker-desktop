import { useEffect, useState } from "react";
import { api, formatMoney, monthNow } from "../api";

type Line = {
  categoryId: string | null;
  name: string;
  plan: string;
  fact: string;
  remaining: string;
  unplanned: boolean;
  overspent: boolean;
};

type Budget = {
  month: string;
  lines: Line[];
  planTotal: string;
  factTotal: string;
  remainingTotal: string;
};

type Cat = { id: string; name: string };

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PlanPage() {
  const [ym, setYm] = useState(monthNow());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [available, setAvailable] = useState<Cat[]>([]);
  const [addCat, setAddCat] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async (month = ym) => {
    const [b, a] = await Promise.all([
      api().budget.month(month) as Promise<Budget>,
      api().budget.available(month) as Promise<Cat[]>,
    ]);
    setBudget(b);
    setAvailable(a);
    const map: Record<string, string> = {};
    for (const line of b.lines) {
      if (line.categoryId) map[line.categoryId] = line.plan;
    }
    setEdits(map);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [ym]);

  const save = async () => {
    try {
      await api().budget.save(ym, edits);
      await load();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().budget.add(ym, addCat, addAmount);
      setAddCat("");
      setAddAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const copy = async () => {
    try {
      await api().budget.copy(ym);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <h1 className="page-title">План</h1>
      <p className="page-sub">Месячный бюджет по расходным категориям</p>
      {error && <div className="error">{error}</div>}

      <div className="panel row">
        <button className="btn" type="button" onClick={() => setYm(shiftMonth(ym, -1))}>
          ←
        </button>
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
        <button className="btn" type="button" onClick={() => setYm(shiftMonth(ym, 1))}>
          →
        </button>
        <button className="btn" type="button" onClick={copy}>
          Скопировать с прошлого месяца
        </button>
        <button className="btn primary" type="button" onClick={save}>
          Сохранить план
        </button>
      </div>

      {budget && (
        <div className="grid-3">
          <div className="stat">
            <div className="label">План</div>
            <div className="value">{formatMoney(budget.planTotal)}</div>
          </div>
          <div className="stat">
            <div className="label">Факт</div>
            <div className="value expense">{formatMoney(budget.factTotal)}</div>
          </div>
          <div className="stat">
            <div className="label">Остаток</div>
            <div className={`value ${Number(budget.remainingTotal) >= 0 ? "income" : "expense"}`}>
              {formatMoney(budget.remainingTotal)}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <form className="row" onSubmit={add}>
          <label className="field">
            Категория
            <select value={addCat} onChange={(e) => setAddCat(e.target.value)} required>
              <option value="">Выберите…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Сумма
            <input value={addAmount} onChange={(e) => setAddAmount(e.target.value)} required />
          </label>
          <button className="btn primary" type="submit">
            Добавить в план
          </button>
        </form>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Категория</th>
              <th>План</th>
              <th>Факт</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {budget?.lines.map((line) => (
              <tr key={line.categoryId ?? line.name}>
                <td>
                  {line.name}
                  {line.unplanned && <span className="muted"> · вне плана</span>}
                  {line.overspent && <span className="error"> · перерасход</span>}
                </td>
                <td>
                  {line.categoryId ? (
                    <input
                      value={edits[line.categoryId] ?? line.plan}
                      onChange={(e) =>
                        setEdits({ ...edits, [line.categoryId!]: e.target.value })
                      }
                    />
                  ) : (
                    formatMoney(line.plan)
                  )}
                </td>
                <td>{formatMoney(line.fact)}</td>
                <td>{formatMoney(line.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}