import { useEffect, useMemo, useState } from "react";
import { api, firstDay, formatMoney, lastDay, monthNow } from "../api";

type Point = { date: string; income: string; expense: string };

export function ChartsPage() {
  const [from, setFrom] = useState(firstDay(monthNow()));
  const [to, setTo] = useState(lastDay(monthNow()));
  const [points, setPoints] = useState<Point[]>([]);
  const [totals, setTotals] = useState({ income: "0", expense: "0", net: "0" });
  const [cats, setCats] = useState<Array<{ name: string; type: string; amount: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [flow, sum] = await Promise.all([
          api().journal.cashflow(from, to) as Promise<Point[]>,
          api().journal.summarize(from, to) as Promise<{
            totals: { income: string; expense: string; net: string };
            byCategory: Array<{ name: string; type: string; amount: string }>;
          }>,
        ]);
        setPoints(flow);
        setTotals(sum.totals);
        setCats(sum.byCategory);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [from, to]);

  const cumulative = useMemo(() => {
    let income = 0;
    let expense = 0;
    return points.map((p) => {
      income += Number(p.income);
      expense += Number(p.expense);
      return { date: p.date, income, expense };
    });
  }, [points]);

  const lineSvg = (data: Array<{ date: string; income: number; expense: number }>) => {
    if (data.length === 0) return null;
    const w = 640;
    const h = 200;
    const pad = 24;
    const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(data.length - 1, 1);
    const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
    const path = (key: "income" | "expense") =>
      data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");
    return (
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
        <path d={path("income")} fill="none" stroke="#3ecf8e" strokeWidth="2.5" />
        <path d={path("expense")} fill="none" stroke="#f07178" strokeWidth="2.5" />
      </svg>
    );
  };

  const bars = cats.filter((c) => c.type === "EXPENSE");
  const maxBar = Math.max(1, ...bars.map((c) => Number(c.amount)));

  return (
    <div>
      <h1 className="page-title">Графики</h1>
      <p className="page-sub">Динамика и накопительные итоги</p>
      {error && <div className="error">{error}</div>}

      <div className="panel row">
        <label className="field">
          С
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          По
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="grid-3">
        <div className="stat">
          <div className="label">Доходы</div>
          <div className="value income">{formatMoney(totals.income)}</div>
        </div>
        <div className="stat">
          <div className="label">Расходы</div>
          <div className="value expense">{formatMoney(totals.expense)}</div>
        </div>
        <div className="stat">
          <div className="label">Разница</div>
          <div className={`value ${Number(totals.net) >= 0 ? "income" : "expense"}`}>
            {formatMoney(totals.net)}
          </div>
        </div>
      </div>

      <div className="panel">
        <strong>Динамика</strong>
        {lineSvg(points.map((p) => ({ date: p.date, income: Number(p.income), expense: Number(p.expense) })))}
      </div>
      <div className="panel">
        <strong>Накопительно</strong>
        {lineSvg(cumulative)}
      </div>
      <div className="panel">
        <strong>Расходы по категориям</strong>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {bars.map((c) => (
            <div key={c.name}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{c.name}</span>
                <span>{formatMoney(c.amount)}</span>
              </div>
              <div className="bar expense">
                <span style={{ width: `${(Number(c.amount) / maxBar) * 100}%` }} />
              </div>
            </div>
          ))}
          {bars.length === 0 && <div className="muted">Нет данных</div>}
        </div>
      </div>
    </div>
  );
}