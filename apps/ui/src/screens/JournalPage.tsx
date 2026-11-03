import { useCallback, useEffect, useState } from "react";
import { api, firstDay, formatMoney, lastDay, monthNow } from "../api";

type Entry = {
  id: string;
  type: string;
  amount: string;
  description: string;
  occurredOn: string;
  categoryId: string | null;
  categoryName: string | null;
  locked: boolean;
};

type Totals = { income: string; expense: string; net: string };
type Cat = { id: string; name: string; type: string };
type Summary = {
  totals: Totals;
  savingsFlow: { toSavings: string; fromSavings: string; net: string };
  byCategory: Array<{ name: string; type: string; amount: string }>;
};

export function JournalPage() {
  const [from, setFrom] = useState(firstDay(monthNow()));
  const [to, setTo] = useState(lastDay(monthNow()));
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>({ income: "0", expense: "0", net: "0" });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [cats, setCats] = useState<Cat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [form, setForm] = useState({
    occurredOn: "",
    type: "EXPENSE",
    amount: "",
    description: "",
    categoryId: "",
  });

  const load = useCallback(async () => {
    setError(null);
    const query = {
      from,
      to,
      type: type || null,
      categoryId: categoryId === "none" ? null : categoryId || null,
      withoutCategory: categoryId === "none",
      text: q || null,
      page,
      size: 50,
    };
    const [result, sum, categories, today] = await Promise.all([
      api().journal.search(query) as Promise<{
        items: Entry[];
        totals: Totals;
        totalPages: number;
      }>,
      api().journal.summarize(from, to) as Promise<Summary>,
      api().categories.list() as Promise<Cat[]>,
      api().periods.today() as Promise<string>,
    ]);
    setItems(result.items);
    setTotals(result.totals);
    setTotalPages(result.totalPages);
    setSummary(sum);
    setCats(categories.filter((c) => !("archived" in c) || !(c as { archived?: boolean }).archived));
    setForm((f) => ({ ...f, occurredOn: f.occurredOn || today }));
  }, [from, to, type, categoryId, q, page]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const setMonth = async (offset: number) => {
    const today = await api().periods.today();
    const d = new Date(today + "T12:00:00");
    d.setMonth(d.getMonth() + offset);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setFrom(firstDay(ym));
    setTo(lastDay(ym));
    setPage(0);
  };

  const setPayPeriod = async () => {
    const range = (await api().periods.pay()) as { from: string; to: string };
    setFrom(range.from);
    setTo(range.to);
    setPage(0);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().journal.create({
        type: form.type,
        amount: form.amount,
        description: form.description,
        occurredOn: form.occurredOn,
        categoryId: form.categoryId || null,
      });
      setForm((f) => ({ ...f, amount: "", description: "", categoryId: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().journal.quickParse(quick);
      setQuick("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (id: string) => {
    await api().journal.delete(id);
    await load();
  };

  const undo = async () => {
    try {
      await api().journal.deleteLast();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const exportExcel = async () => {
    try {
      await api().exportExcel(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const expenseCats = summary?.byCategory.filter((c) => c.type === "EXPENSE") ?? [];
  const maxExp = Math.max(1, ...expenseCats.map((c) => Number(c.amount)));
  const formCats = cats.filter(
    (c) => c.type === form.type || form.type === "TO_SAVINGS" || form.type === "FROM_SAVINGS",
  );

  return (
    <div>
      <h1 className="page-title">Журнал</h1>
      <p className="page-sub">Доходы, расходы и накопления за выбранный период</p>
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <div className="row">
          <label className="field">
            С
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          </label>
          <label className="field">
            По
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </label>
          <label className="field">
            Тип
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
              <option value="TO_SAVINGS">В накопления</option>
              <option value="FROM_SAVINGS">Из накоплений</option>
            </select>
          </label>
          <label className="field">
            Категория
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="none">Без категории</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Поиск
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="текст…" />
          </label>
          <button className="btn" type="button" onClick={() => setMonth(-1)}>
            Прошлый месяц
          </button>
          <button className="btn" type="button" onClick={() => setMonth(0)}>
            Текущий месяц
          </button>
          <button className="btn" type="button" onClick={setPayPeriod}>
            Расчётный период
          </button>
          <button className="btn" type="button" onClick={exportExcel}>
            Excel
          </button>
          <button className="btn" type="button" onClick={undo}>
            Отменить последнюю
          </button>
        </div>
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

      {summary && (Number(summary.savingsFlow.toSavings) > 0 || Number(summary.savingsFlow.fromSavings) > 0) && (
        <div className="panel muted">
          Накопления: в {formatMoney(summary.savingsFlow.toSavings)} / из{" "}
          {formatMoney(summary.savingsFlow.fromSavings)}
        </div>
      )}

      {expenseCats.length > 0 && (
        <div className="panel">
          <strong>Расходы по категориям</strong>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {expenseCats.map((c) => (
              <div key={c.name}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>{c.name}</span>
                  <span>{formatMoney(c.amount)}</span>
                </div>
                <div className="bar expense">
                  <span style={{ width: `${(Number(c.amount) / maxExp) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <form className="row" onSubmit={quickAdd}>
          <label className="field" style={{ flex: 1 }}>
            Быстрый ввод
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="250 кофе · +80000 зарплата · в накопления 5000"
            />
          </label>
          <button className="btn primary" type="submit">
            Добавить
          </button>
        </form>
      </div>

      <div className="panel">
        <form className="row" onSubmit={create}>
          <label className="field">
            Дата
            <input
              type="date"
              value={form.occurredOn}
              onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
              required
            />
          </label>
          <label className="field">
            Тип
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value, categoryId: "" })}
            >
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
              <option value="TO_SAVINGS">В накопления</option>
              <option value="FROM_SAVINGS">Из накоплений</option>
            </select>
          </label>
          <label className="field">
            Сумма
            <input
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </label>
          <label className="field">
            Описание
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={500}
            />
          </label>
          {(form.type === "INCOME" || form.type === "EXPENSE") && (
            <label className="field">
              Категория
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Без категории</option>
                {formCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn primary" type="submit">
            Записать
          </button>
        </form>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Сумма</th>
              <th>Описание</th>
              <th>Категория</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td>{e.occurredOn}</td>
                <td>{e.type}</td>
                <td>{formatMoney(e.amount)}</td>
                <td>{e.description}</td>
                <td>{e.categoryName || "—"}</td>
                <td>
                  <button className="btn danger" type="button" onClick={() => remove(e.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Нет записей
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            Назад
          </button>
          <span className="muted">
            Стр. {page + 1} / {Math.max(totalPages, 1)}
          </span>
          <button
            className="btn"
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </button>
        </div>
      </div>
    </div>
  );
}